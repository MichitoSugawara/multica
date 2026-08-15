package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// Shared Terminal / Browser panes on an issue ("タスク詳細" right/bottom dock).
// These commands let an agent (or a human in a shell) drive the same PTY and
// Chromium sessions the Multica UI shows, so work stays visible to everyone
// watching the issue. The MCP server in cmd_session_mcp.go reuses these
// helpers 1:1.

type issueSessionRecord struct {
	ID        string  `json:"id"`
	Kind      string  `json:"kind"`
	DaemonID  string  `json:"daemon_id"`
	RuntimeID string  `json:"runtime_id"`
	Status    string  `json:"status"`
	Cwd       *string `json:"cwd"`
	URL       *string `json:"url"`
	CreatedAt string  `json:"created_at"`
}

func listIssueSessions(ctx context.Context, client *cli.APIClient, issueID string) ([]issueSessionRecord, error) {
	var resp struct {
		Sessions []issueSessionRecord `json:"sessions"`
	}
	if err := client.GetJSON(ctx, "/api/issues/"+url.PathEscape(issueID)+"/runtime-sessions", &resp); err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	return resp.Sessions, nil
}

func createIssueSession(ctx context.Context, client *cli.APIClient, issueID, kind, daemonID, runtimeID string) (issueSessionRecord, error) {
	var out issueSessionRecord
	body := map[string]string{"kind": kind}
	if daemonID != "" {
		body["daemon_id"] = daemonID
	}
	if runtimeID != "" {
		body["runtime_id"] = runtimeID
	}
	if err := client.PostJSON(ctx, "/api/issues/"+url.PathEscape(issueID)+"/runtime-sessions", body, &out); err != nil {
		return out, fmt.Errorf("open session: %w", err)
	}
	return out, nil
}

func closeIssueSession(ctx context.Context, client *cli.APIClient, issueID, sessionID string) error {
	var out issueSessionRecord
	if err := client.PostJSON(ctx, "/api/issues/"+url.PathEscape(issueID)+"/runtime-sessions/"+url.PathEscape(sessionID)+"/close", map[string]string{}, &out); err != nil {
		return fmt.Errorf("close session: %w", err)
	}
	return nil
}

// resolveIssueSessionRef accepts a full session UUID or unique prefix among
// this issue's open sessions of the wanted kind. An empty ref picks the sole
// open session of that kind so agents don't have to copy UUIDs around.
func resolveIssueSessionRef(ctx context.Context, client *cli.APIClient, issueID, kind, ref string) (issueSessionRecord, error) {
	sessions, err := listIssueSessions(ctx, client, issueID)
	if err != nil {
		return issueSessionRecord{}, err
	}
	var candidates []issueSessionRecord
	for _, s := range sessions {
		if s.Status != "open" || (kind != "" && s.Kind != kind) {
			continue
		}
		if ref == "" || s.ID == ref || strings.HasPrefix(s.ID, strings.ToLower(strings.TrimSpace(ref))) {
			candidates = append(candidates, s)
		}
	}
	switch len(candidates) {
	case 1:
		return candidates[0], nil
	case 0:
		if ref == "" {
			return issueSessionRecord{}, fmt.Errorf("no open %s session on this issue; run the matching `open` command first", kind)
		}
		return issueSessionRecord{}, fmt.Errorf("no open %s session matches %q", kind, ref)
	default:
		if ref == "" {
			ids := make([]string, 0, len(candidates))
			for _, c := range candidates {
				ids = append(ids, c.ID)
			}
			return issueSessionRecord{}, fmt.Errorf("multiple open %s sessions; pass a session id: %s", kind, strings.Join(ids, ", "))
		}
		return issueSessionRecord{}, fmt.Errorf("session ref %q is ambiguous", ref)
	}
}

// localDaemonID asks the local daemon's health endpoint who it is, so agents
// running inside a task can open sessions on "this machine" without knowing
// runtime UUIDs. Returns "" outside a daemon-managed context.
func localDaemonID() string {
	port := strings.TrimSpace(os.Getenv("MULTICA_DAEMON_PORT"))
	if port == "" {
		return ""
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var health struct {
		DaemonID string `json:"daemon_id"`
	}
	if json.NewDecoder(resp.Body).Decode(&health) != nil {
		return ""
	}
	return health.DaemonID
}

func issueSessionTargetFlags(cmd *cobra.Command) (daemonID, runtimeID string) {
	daemonID, _ = cmd.Flags().GetString("daemon")
	runtimeID, _ = cmd.Flags().GetString("runtime")
	if daemonID == "" && runtimeID == "" {
		daemonID = localDaemonID()
	}
	return daemonID, runtimeID
}

func dialIssueSessionFromCmd(cmd *cobra.Command, issueID string) (*cli.SessionClient, error) {
	serverURL := resolveServerURL(cmd)
	if serverURL == "" {
		return nil, fmt.Errorf("server URL not set: use --server-url flag or MULTICA_SERVER_URL env")
	}
	token := resolveToken(cmd)
	if token == "" {
		return nil, fmt.Errorf("no auth token: set MULTICA_TOKEN or log in")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return cli.DialIssueSession(ctx, serverURL, token, issueID)
}

func sendBrowserAction(ws *cli.SessionClient, sessionID string, action map[string]any) error {
	raw, err := json.Marshal(action)
	if err != nil {
		return err
	}
	return ws.SendInput(sessionID, protocol.SessionKindBrowser, base64.StdEncoding.EncodeToString(raw))
}

// readTerminal attaches, collects the scrollback snapshot, and renders it.
func readTerminal(ws *cli.SessionClient, sessionID string, lines int, raw bool) (string, error) {
	snap, err := ws.CollectSnapshot(sessionID, protocol.SessionKindPTY, 0, 0, 15*time.Second, 400*time.Millisecond)
	if err != nil {
		return "", err
	}
	if snap.LargestData == nil {
		return "", nil
	}
	data, err := base64.StdEncoding.DecodeString(snap.LargestData.Data)
	if err != nil {
		return "", fmt.Errorf("decode terminal data: %w", err)
	}
	if raw {
		return string(data), nil
	}
	return cli.RenderTerminalText(data, lines), nil
}

// --- terminal commands ---

var issueTerminalCmd = &cobra.Command{
	Use:   "terminal",
	Short: "Work with the issue's shared Terminal panes (visible in the Multica UI)",
}

var issueTerminalListCmd = &cobra.Command{
	Use:   "list <issue>",
	Short: "List open Terminal/Browser sessions on an issue",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := newAPIClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := cli.APIContext(context.Background())
		defer cancel()
		issue, err := resolveIssueRef(ctx, client, args[0])
		if err != nil {
			return err
		}
		sessions, err := listIssueSessions(ctx, client, issue.ID)
		if err != nil {
			return err
		}
		output, _ := cmd.Flags().GetString("output")
		if output == "json" {
			return cli.PrintJSON(os.Stdout, sessions)
		}
		rows := make([][]string, 0, len(sessions))
		for _, s := range sessions {
			u := ""
			if s.URL != nil {
				u = *s.URL
			}
			rows = append(rows, []string{s.ID, s.Kind, s.Status, u})
		}
		cli.PrintTable(os.Stdout, []string{"SESSION", "KIND", "STATUS", "URL"}, rows)
		return nil
	},
}

var issueTerminalOpenCmd = &cobra.Command{
	Use:   "open <issue>",
	Short: "Open a new shared Terminal on an issue (appears in the UI for everyone)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := newAPIClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := cli.APIContext(context.Background())
		defer cancel()
		issue, err := resolveIssueRef(ctx, client, args[0])
		if err != nil {
			return err
		}
		daemonID, runtimeID := issueSessionTargetFlags(cmd)
		s, err := createIssueSession(ctx, client, issue.ID, protocol.SessionKindPTY, daemonID, runtimeID)
		if err != nil {
			return err
		}
		return cli.PrintJSON(os.Stdout, s)
	},
}

var issueTerminalSendCmd = &cobra.Command{
	Use:   "send <issue> [session]",
	Short: "Send input to a shared Terminal, then print the visible output",
	Long: "Sends text to the shared PTY. By default a trailing newline is appended\n" +
		"(like pressing Enter); pass --no-enter for partial input. After sending,\n" +
		"waits --wait and prints the rendered terminal tail.",
	Args: cobra.RangeArgs(1, 2),
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := newAPIClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := cli.APIContext(context.Background())
		defer cancel()
		issue, err := resolveIssueRef(ctx, client, args[0])
		if err != nil {
			return err
		}
		ref := ""
		if len(args) > 1 {
			ref = args[1]
		}
		session, err := resolveIssueSessionRef(ctx, client, issue.ID, protocol.SessionKindPTY, ref)
		if err != nil {
			return err
		}
		text, _ := cmd.Flags().GetString("text")
		noEnter, _ := cmd.Flags().GetBool("no-enter")
		if text == "" {
			return fmt.Errorf("--text is required")
		}
		payload := text
		if !noEnter {
			payload += "\n"
		}
		ws, err := dialIssueSessionFromCmd(cmd, issue.ID)
		if err != nil {
			return err
		}
		defer ws.Close()
		if err := ws.SendInput(session.ID, protocol.SessionKindPTY, base64.StdEncoding.EncodeToString([]byte(payload))); err != nil {
			return fmt.Errorf("send input: %w", err)
		}
		waitMs, _ := cmd.Flags().GetInt("wait")
		time.Sleep(time.Duration(waitMs) * time.Millisecond)
		lines, _ := cmd.Flags().GetInt("lines")
		out, err := readTerminal(ws, session.ID, lines, false)
		if err != nil {
			return err
		}
		fmt.Println(out)
		return nil
	},
}

var issueTerminalReadCmd = &cobra.Command{
	Use:   "read <issue> [session]",
	Short: "Print the shared Terminal's current visible output",
	Args:  cobra.RangeArgs(1, 2),
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := newAPIClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := cli.APIContext(context.Background())
		defer cancel()
		issue, err := resolveIssueRef(ctx, client, args[0])
		if err != nil {
			return err
		}
		ref := ""
		if len(args) > 1 {
			ref = args[1]
		}
		session, err := resolveIssueSessionRef(ctx, client, issue.ID, protocol.SessionKindPTY, ref)
		if err != nil {
			return err
		}
		ws, err := dialIssueSessionFromCmd(cmd, issue.ID)
		if err != nil {
			return err
		}
		defer ws.Close()
		lines, _ := cmd.Flags().GetInt("lines")
		raw, _ := cmd.Flags().GetBool("raw")
		out, err := readTerminal(ws, session.ID, lines, raw)
		if err != nil {
			return err
		}
		fmt.Println(out)
		return nil
	},
}

var issueTerminalCloseCmd = &cobra.Command{
	Use:   "close <issue> [session]",
	Short: "End a shared Terminal session for every viewer",
	Args:  cobra.RangeArgs(1, 2),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runIssueSessionClose(cmd, args, protocol.SessionKindPTY)
	},
}

func runIssueSessionClose(cmd *cobra.Command, args []string, kind string) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	issue, err := resolveIssueRef(ctx, client, args[0])
	if err != nil {
		return err
	}
	ref := ""
	if len(args) > 1 {
		ref = args[1]
	}
	session, err := resolveIssueSessionRef(ctx, client, issue.ID, kind, ref)
	if err != nil {
		return err
	}
	if err := closeIssueSession(ctx, client, issue.ID, session.ID); err != nil {
		return err
	}
	fmt.Printf("Closed %s session %s\n", kind, session.ID)
	return nil
}

// --- browser commands ---

var issueBrowserCmd = &cobra.Command{
	Use:   "browser",
	Short: "Work with the issue's shared Browser pane (visible in the Multica UI)",
}

var issueBrowserOpenCmd = &cobra.Command{
	Use:   "open <issue>",
	Short: "Open a new shared Browser on an issue",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := newAPIClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := cli.APIContext(context.Background())
		defer cancel()
		issue, err := resolveIssueRef(ctx, client, args[0])
		if err != nil {
			return err
		}
		daemonID, runtimeID := issueSessionTargetFlags(cmd)
		s, err := createIssueSession(ctx, client, issue.ID, protocol.SessionKindBrowser, daemonID, runtimeID)
		if err != nil {
			return err
		}
		if startURL, _ := cmd.Flags().GetString("url"); startURL != "" {
			ws, wsErr := dialIssueSessionFromCmd(cmd, issue.ID)
			if wsErr != nil {
				return wsErr
			}
			defer ws.Close()
			if _, err := ws.CollectSnapshot(s.ID, protocol.SessionKindBrowser, 1280, 800, 20*time.Second, 0); err != nil {
				return err
			}
			if err := sendBrowserAction(ws, s.ID, map[string]any{"type": "navigate", "url": startURL}); err != nil {
				return err
			}
		}
		return cli.PrintJSON(os.Stdout, s)
	},
}

var issueBrowserGotoCmd = &cobra.Command{
	Use:   "goto <issue> <url>",
	Short: "Navigate the shared Browser to a URL",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runBrowserAction(cmd, args[0], map[string]any{"type": "navigate", "url": args[1]})
	},
}

var issueBrowserActCmd = &cobra.Command{
	Use:   "act <issue>",
	Short: "Send an interaction to the shared Browser (click / type / key / scroll / back / forward / reload)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		action, _ := cmd.Flags().GetString("action")
		x, _ := cmd.Flags().GetFloat64("x")
		y, _ := cmd.Flags().GetFloat64("y")
		text, _ := cmd.Flags().GetString("text")
		key, _ := cmd.Flags().GetString("key")
		deltaX, _ := cmd.Flags().GetFloat64("delta-x")
		deltaY, _ := cmd.Flags().GetFloat64("delta-y")
		var payload map[string]any
		switch action {
		case "click":
			payload = map[string]any{"type": "click", "x": x, "y": y}
		case "type":
			if text == "" {
				return fmt.Errorf("--text is required for --action type")
			}
			payload = map[string]any{"type": "insertText", "text": text}
		case "key":
			if key == "" {
				return fmt.Errorf("--key is required for --action key (e.g. Enter, Escape, Tab)")
			}
			payload = map[string]any{"type": "keydown", "key": key, "code": key, "text": keyText(key)}
		case "scroll":
			payload = map[string]any{"type": "scroll", "x": x, "y": y, "deltaX": deltaX, "deltaY": deltaY}
		case "back", "forward", "reload":
			payload = map[string]any{"type": action}
		default:
			return fmt.Errorf("unknown --action %q; valid: click, type, key, scroll, back, forward, reload", action)
		}
		return runBrowserAction(cmd, args[0], payload)
	},
}

func keyText(key string) string {
	if len(key) == 1 {
		return key
	}
	if key == "Enter" {
		return "\r"
	}
	return ""
}

func runBrowserAction(cmd *cobra.Command, issueRef string, action map[string]any) error {
	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := cli.APIContext(context.Background())
	defer cancel()
	issue, err := resolveIssueRef(ctx, client, issueRef)
	if err != nil {
		return err
	}
	ref, _ := cmd.Flags().GetString("session")
	session, err := resolveIssueSessionRef(ctx, client, issue.ID, protocol.SessionKindBrowser, ref)
	if err != nil {
		return err
	}
	ws, err := dialIssueSessionFromCmd(cmd, issue.ID)
	if err != nil {
		return err
	}
	defer ws.Close()
	// Attach first so the daemon has this viewer registered and the session
	// is confirmed live before input is sent.
	snap, err := ws.CollectSnapshot(session.ID, protocol.SessionKindBrowser, 0, 0, 15*time.Second, 0)
	if err != nil {
		return err
	}
	if err := sendBrowserAction(ws, session.ID, action); err != nil {
		return err
	}
	// Give the page a moment, then report the (possibly new) URL.
	after, err := ws.CollectSnapshot(session.ID, protocol.SessionKindBrowser, 0, 0, 8*time.Second, 700*time.Millisecond)
	if err == nil && after.URL != "" {
		snap = after
	}
	fmt.Printf("ok url=%s\n", snap.URL)
	return nil
}

var issueBrowserScreenshotCmd = &cobra.Command{
	Use:   "screenshot <issue>",
	Short: "Save the shared Browser's current frame as a JPEG",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := newAPIClient(cmd)
		if err != nil {
			return err
		}
		ctx, cancel := cli.APIContext(context.Background())
		defer cancel()
		issue, err := resolveIssueRef(ctx, client, args[0])
		if err != nil {
			return err
		}
		ref, _ := cmd.Flags().GetString("session")
		session, err := resolveIssueSessionRef(ctx, client, issue.ID, protocol.SessionKindBrowser, ref)
		if err != nil {
			return err
		}
		ws, err := dialIssueSessionFromCmd(cmd, issue.ID)
		if err != nil {
			return err
		}
		defer ws.Close()
		snap, err := ws.CollectSnapshot(session.ID, protocol.SessionKindBrowser, 0, 0, 15*time.Second, 500*time.Millisecond)
		if err != nil {
			return err
		}
		if snap.LastData == nil {
			return fmt.Errorf("no frame received; is the browser session still loading?")
		}
		data, err := base64.StdEncoding.DecodeString(snap.LastData.Data)
		if err != nil {
			return fmt.Errorf("decode frame: %w", err)
		}
		outPath, _ := cmd.Flags().GetString("out")
		if outPath == "" {
			outPath = fmt.Sprintf("browser-%s.jpg", time.Now().Format("20060102-150405"))
		}
		if err := os.WriteFile(outPath, data, 0o644); err != nil {
			return fmt.Errorf("write screenshot: %w", err)
		}
		fmt.Printf("saved %s (%d bytes, url=%s)\n", outPath, len(data), snap.URL)
		return nil
	},
}

var issueBrowserCloseCmd = &cobra.Command{
	Use:   "close <issue> [session]",
	Short: "End a shared Browser session for every viewer",
	Args:  cobra.RangeArgs(1, 2),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runIssueSessionClose(cmd, args, protocol.SessionKindBrowser)
	},
}

func init() {
	for _, c := range []*cobra.Command{issueTerminalOpenCmd, issueBrowserOpenCmd} {
		c.Flags().String("daemon", "", "Daemon ID of the machine to open the session on (default: this task's machine)")
		c.Flags().String("runtime", "", "Runtime ID of the machine to open the session on")
	}
	issueTerminalListCmd.Flags().String("output", "table", "Output format: table or json")
	issueTerminalSendCmd.Flags().String("text", "", "Text to send to the terminal")
	issueTerminalSendCmd.Flags().Bool("no-enter", false, "Do not append a trailing newline")
	issueTerminalSendCmd.Flags().Int("wait", 1200, "Milliseconds to wait before reading output")
	issueTerminalSendCmd.Flags().Int("lines", 60, "Max output lines to print")
	issueTerminalReadCmd.Flags().Int("lines", 120, "Max output lines to print")
	issueTerminalReadCmd.Flags().Bool("raw", false, "Print raw bytes with ANSI escapes intact")
	issueBrowserOpenCmd.Flags().String("url", "", "Navigate to this URL right after opening")
	for _, c := range []*cobra.Command{issueBrowserGotoCmd, issueBrowserActCmd, issueBrowserScreenshotCmd} {
		c.Flags().String("session", "", "Browser session id (default: the sole open browser session)")
	}
	issueBrowserActCmd.Flags().String("action", "", "Interaction: click, type, key, scroll, back, forward, reload")
	issueBrowserActCmd.Flags().Float64("x", 0, "X coordinate (click/scroll)")
	issueBrowserActCmd.Flags().Float64("y", 0, "Y coordinate (click/scroll)")
	issueBrowserActCmd.Flags().String("text", "", "Text to type (action=type)")
	issueBrowserActCmd.Flags().String("key", "", "Key to press (action=key), e.g. Enter")
	issueBrowserActCmd.Flags().Float64("delta-x", 0, "Horizontal scroll delta")
	issueBrowserActCmd.Flags().Float64("delta-y", 0, "Vertical scroll delta")
	issueBrowserScreenshotCmd.Flags().String("out", "", "Output file path (default: browser-<timestamp>.jpg)")

	issueTerminalCmd.AddCommand(issueTerminalListCmd)
	issueTerminalCmd.AddCommand(issueTerminalOpenCmd)
	issueTerminalCmd.AddCommand(issueTerminalSendCmd)
	issueTerminalCmd.AddCommand(issueTerminalReadCmd)
	issueTerminalCmd.AddCommand(issueTerminalCloseCmd)
	issueBrowserCmd.AddCommand(issueBrowserOpenCmd)
	issueBrowserCmd.AddCommand(issueBrowserGotoCmd)
	issueBrowserCmd.AddCommand(issueBrowserActCmd)
	issueBrowserCmd.AddCommand(issueBrowserScreenshotCmd)
	issueBrowserCmd.AddCommand(issueBrowserCloseCmd)
	issueCmd.AddCommand(issueTerminalCmd)
	issueCmd.AddCommand(issueBrowserCmd)
}
