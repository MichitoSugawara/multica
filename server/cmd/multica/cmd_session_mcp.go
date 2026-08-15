package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
	"github.com/multica-ai/multica/server/internal/daemon/execenv"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// `multica session-mcp` is a stdio MCP server exposing the issue's shared
// Terminal / Browser panes as agent tools. The daemon injects it into managed
// agent MCP configs (see daemon/runtime_mcp.go), so an agent working a task
// can drive the same panes the humans watching the issue see — instead of
// spawning invisible private shells and browsers.
//
// Transport is newline-delimited JSON-RPC 2.0 per the MCP stdio spec. The
// implementation is deliberately dependency-free: initialize, tools/list and
// tools/call are the whole surface.
var sessionMcpCmd = &cobra.Command{
	Use:    "session-mcp",
	Short:  "Run the stdio MCP server for shared issue Terminal/Browser panes",
	Hidden: true,
	RunE: func(cmd *cobra.Command, _ []string) error {
		srv := &sessionMcpServer{cmd: cmd}
		return srv.serve()
	},
}

type sessionMcpServer struct {
	cmd *cobra.Command
}

type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type jsonRPCResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *jsonRPCError   `json:"error,omitempty"`
}

func (s *sessionMcpServer) serve() error {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	out := bufio.NewWriter(os.Stdout)
	enc := json.NewEncoder(out)
	write := func(resp jsonRPCResponse) {
		resp.JSONRPC = "2.0"
		_ = enc.Encode(resp)
		_ = out.Flush()
	}
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var req jsonRPCRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			continue
		}
		if len(req.ID) == 0 {
			continue // notification (e.g. notifications/initialized)
		}
		switch req.Method {
		case "initialize":
			write(jsonRPCResponse{ID: req.ID, Result: map[string]any{
				"protocolVersion": "2024-11-05",
				"capabilities":    map[string]any{"tools": map[string]any{}},
				"serverInfo": map[string]any{
					"name":    "multica-session",
					"version": cli.ClientVersion,
				},
			}})
		case "ping":
			write(jsonRPCResponse{ID: req.ID, Result: map[string]any{}})
		case "tools/list":
			write(jsonRPCResponse{ID: req.ID, Result: map[string]any{"tools": sessionMcpTools()}})
		case "tools/call":
			var params struct {
				Name      string          `json:"name"`
				Arguments json.RawMessage `json:"arguments"`
			}
			if err := json.Unmarshal(req.Params, &params); err != nil {
				write(jsonRPCResponse{ID: req.ID, Error: &jsonRPCError{Code: -32602, Message: "invalid params"}})
				continue
			}
			result := s.callTool(params.Name, params.Arguments)
			write(jsonRPCResponse{ID: req.ID, Result: result})
		default:
			write(jsonRPCResponse{ID: req.ID, Error: &jsonRPCError{Code: -32601, Message: "method not found: " + req.Method}})
		}
	}
	return scanner.Err()
}

func mcpText(format string, args ...any) map[string]any {
	return map[string]any{
		"content": []map[string]any{{"type": "text", "text": fmt.Sprintf(format, args...)}},
	}
}

func mcpError(err error) map[string]any {
	return map[string]any{
		"isError": true,
		"content": []map[string]any{{"type": "text", "text": err.Error()}},
	}
}

var issueParamSchema = map[string]any{
	"type":        "string",
	"description": "Issue key (e.g. DALE-2) or UUID. Optional inside a task: defaults to the task's own issue.",
}

var sessionParamSchema = map[string]any{
	"type":        "string",
	"description": "Session id (or unique prefix). Optional when the issue has exactly one open session of this kind.",
}

func sessionMcpTools() []map[string]any {
	obj := func(props map[string]any, required ...string) map[string]any {
		schema := map[string]any{"type": "object", "properties": props}
		if len(required) > 0 {
			schema["required"] = required
		}
		return schema
	}
	return []map[string]any{
		{
			"name":        "terminal_list",
			"description": "List the open shared Terminal/Browser sessions on the issue. These panes are visible to everyone viewing the issue in Multica.",
			"inputSchema": obj(map[string]any{"issue": issueParamSchema}),
		},
		{
			"name":        "terminal_open",
			"description": "Open a new shared Terminal on the issue. It appears as a tab in the Multica UI; prefer it over private shells when the user should see your work.",
			"inputSchema": obj(map[string]any{"issue": issueParamSchema}),
		},
		{
			"name":        "terminal_send",
			"description": "Type into the shared Terminal (a newline is appended unless no_enter). Returns the visible output after wait_ms.",
			"inputSchema": obj(map[string]any{
				"issue":    issueParamSchema,
				"session":  sessionParamSchema,
				"text":     map[string]any{"type": "string", "description": "Text to send"},
				"no_enter": map[string]any{"type": "boolean", "description": "Do not append a trailing newline"},
				"wait_ms":  map[string]any{"type": "integer", "description": "How long to wait before reading output (default 1500)"},
			}, "text"),
		},
		{
			"name":        "terminal_read",
			"description": "Read the shared Terminal's current visible output (ANSI stripped).",
			"inputSchema": obj(map[string]any{
				"issue":   issueParamSchema,
				"session": sessionParamSchema,
				"lines":   map[string]any{"type": "integer", "description": "Max lines from the tail (default 120)"},
			}),
		},
		{
			"name":        "terminal_close",
			"description": "End a shared Terminal session for every viewer.",
			"inputSchema": obj(map[string]any{"issue": issueParamSchema, "session": sessionParamSchema}),
		},
		{
			"name":        "browser_open",
			"description": "Open the shared Browser pane on the issue (visible in the Multica UI), optionally navigating to a URL.",
			"inputSchema": obj(map[string]any{
				"issue": issueParamSchema,
				"url":   map[string]any{"type": "string", "description": "URL to load after opening"},
			}),
		},
		{
			"name":        "browser_goto",
			"description": "Navigate the shared Browser to a URL.",
			"inputSchema": obj(map[string]any{
				"issue":   issueParamSchema,
				"session": sessionParamSchema,
				"url":     map[string]any{"type": "string"},
			}, "url"),
		},
		{
			"name":        "browser_act",
			"description": "Interact with the shared Browser: click at coordinates, type text, press a key, scroll, or go back/forward/reload. Take a screenshot first to find coordinates.",
			"inputSchema": obj(map[string]any{
				"issue":   issueParamSchema,
				"session": sessionParamSchema,
				"action":  map[string]any{"type": "string", "enum": []string{"click", "type", "key", "scroll", "back", "forward", "reload"}},
				"x":       map[string]any{"type": "number", "description": "X coordinate in the page frame (click/scroll)"},
				"y":       map[string]any{"type": "number", "description": "Y coordinate in the page frame (click/scroll)"},
				"text":    map[string]any{"type": "string", "description": "Text to type (action=type)"},
				"key":     map[string]any{"type": "string", "description": "Key to press (action=key), e.g. Enter, Escape, Tab"},
				"delta_x": map[string]any{"type": "number", "description": "Horizontal scroll delta"},
				"delta_y": map[string]any{"type": "number", "description": "Vertical scroll delta"},
			}, "action"),
		},
		{
			"name":        "browser_screenshot",
			"description": "Capture the shared Browser's current frame as a JPEG image.",
			"inputSchema": obj(map[string]any{"issue": issueParamSchema, "session": sessionParamSchema}),
		},
		{
			"name":        "browser_close",
			"description": "End a shared Browser session for every viewer.",
			"inputSchema": obj(map[string]any{"issue": issueParamSchema, "session": sessionParamSchema}),
		},
	}
}

type sessionMcpArgs struct {
	Issue   string  `json:"issue"`
	Session string  `json:"session"`
	Text    string  `json:"text"`
	NoEnter bool    `json:"no_enter"`
	WaitMs  int     `json:"wait_ms"`
	Lines   int     `json:"lines"`
	URL     string  `json:"url"`
	Action  string  `json:"action"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Key     string  `json:"key"`
	DeltaX  float64 `json:"delta_x"`
	DeltaY  float64 `json:"delta_y"`
}

// defaultIssueRef resolves the issue an agent task is working on when the
// tool call omits `issue`: MULTICA_ISSUE_ID from the task environment first,
// then the daemon's workdir marker.
func defaultIssueRef() string {
	if v := strings.TrimSpace(os.Getenv("MULTICA_ISSUE_ID")); v != "" {
		return v
	}
	markerPath := daemonTaskContextMarkerPath()
	if markerPath == "" {
		return ""
	}
	data, err := os.ReadFile(filepath.Clean(markerPath))
	if err != nil {
		return ""
	}
	var marker struct {
		ManagedBy string `json:"managed_by"`
		IssueID   string `json:"issue_id"`
	}
	if json.Unmarshal(data, &marker) != nil || marker.ManagedBy != execenv.TaskContextMarkerManagedBy {
		return ""
	}
	return marker.IssueID
}

func (s *sessionMcpServer) callTool(name string, rawArgs json.RawMessage) map[string]any {
	var args sessionMcpArgs
	if len(rawArgs) > 0 {
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return mcpError(fmt.Errorf("invalid arguments: %w", err))
		}
	}
	client, err := newAPIClient(s.cmd)
	if err != nil {
		return mcpError(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	issueRef := strings.TrimSpace(args.Issue)
	if issueRef == "" {
		issueRef = defaultIssueRef()
	}
	if issueRef == "" {
		return mcpError(fmt.Errorf("no issue specified and no task issue detected; pass the `issue` argument (e.g. DALE-2)"))
	}
	issue, err := resolveIssueRef(ctx, client, issueRef)
	if err != nil {
		return mcpError(err)
	}

	dial := func() (*cli.SessionClient, error) {
		return dialIssueSessionFromCmd(s.cmd, issue.ID)
	}
	pickSession := func(kind string) (issueSessionRecord, error) {
		return resolveIssueSessionRef(ctx, client, issue.ID, kind, strings.TrimSpace(args.Session))
	}

	switch name {
	case "terminal_list":
		sessions, err := listIssueSessions(ctx, client, issue.ID)
		if err != nil {
			return mcpError(err)
		}
		raw, _ := json.MarshalIndent(sessions, "", "  ")
		return mcpText("%s", string(raw))

	case "terminal_open":
		record, err := createIssueSession(ctx, client, issue.ID, protocol.SessionKindPTY, localDaemonID(), "")
		if err != nil {
			return mcpError(err)
		}
		return mcpText("opened terminal session %s on %s", record.ID, issue.Display)

	case "terminal_send":
		if args.Text == "" {
			return mcpError(fmt.Errorf("text is required"))
		}
		session, err := pickSession(protocol.SessionKindPTY)
		if err != nil {
			return mcpError(err)
		}
		ws, err := dial()
		if err != nil {
			return mcpError(err)
		}
		defer ws.Close()
		payload := args.Text
		if !args.NoEnter {
			payload += "\n"
		}
		if err := ws.SendInput(session.ID, protocol.SessionKindPTY, base64.StdEncoding.EncodeToString([]byte(payload))); err != nil {
			return mcpError(fmt.Errorf("send input: %w", err))
		}
		waitMs := args.WaitMs
		if waitMs <= 0 {
			waitMs = 1500
		}
		time.Sleep(time.Duration(waitMs) * time.Millisecond)
		lines := args.Lines
		if lines <= 0 {
			lines = 60
		}
		out, err := readTerminal(ws, session.ID, lines, false)
		if err != nil {
			return mcpError(err)
		}
		return mcpText("%s", out)

	case "terminal_read":
		session, err := pickSession(protocol.SessionKindPTY)
		if err != nil {
			return mcpError(err)
		}
		ws, err := dial()
		if err != nil {
			return mcpError(err)
		}
		defer ws.Close()
		lines := args.Lines
		if lines <= 0 {
			lines = 120
		}
		out, err := readTerminal(ws, session.ID, lines, false)
		if err != nil {
			return mcpError(err)
		}
		return mcpText("%s", out)

	case "terminal_close", "browser_close":
		kind := protocol.SessionKindPTY
		if name == "browser_close" {
			kind = protocol.SessionKindBrowser
		}
		session, err := pickSession(kind)
		if err != nil {
			return mcpError(err)
		}
		if err := closeIssueSession(ctx, client, issue.ID, session.ID); err != nil {
			return mcpError(err)
		}
		return mcpText("closed %s session %s", kind, session.ID)

	case "browser_open":
		record, err := createIssueSession(ctx, client, issue.ID, protocol.SessionKindBrowser, localDaemonID(), "")
		if err != nil {
			return mcpError(err)
		}
		if args.URL != "" {
			ws, err := dial()
			if err != nil {
				return mcpError(err)
			}
			defer ws.Close()
			if _, err := ws.CollectSnapshot(record.ID, protocol.SessionKindBrowser, 1280, 800, 20*time.Second, 0); err != nil {
				return mcpError(err)
			}
			if err := sendBrowserAction(ws, record.ID, map[string]any{"type": "navigate", "url": args.URL}); err != nil {
				return mcpError(err)
			}
		}
		return mcpText("opened browser session %s on %s%s", record.ID, issue.Display, browserOpenSuffix(args.URL))

	case "browser_goto":
		if args.URL == "" {
			return mcpError(fmt.Errorf("url is required"))
		}
		return s.browserAction(ctx, client, issue.ID, args.Session, map[string]any{"type": "navigate", "url": args.URL})

	case "browser_act":
		var payload map[string]any
		switch args.Action {
		case "click":
			payload = map[string]any{"type": "click", "x": args.X, "y": args.Y}
		case "type":
			if args.Text == "" {
				return mcpError(fmt.Errorf("text is required for action=type"))
			}
			payload = map[string]any{"type": "insertText", "text": args.Text}
		case "key":
			if args.Key == "" {
				return mcpError(fmt.Errorf("key is required for action=key"))
			}
			payload = map[string]any{"type": "keydown", "key": args.Key, "code": args.Key, "text": keyText(args.Key)}
		case "scroll":
			payload = map[string]any{"type": "scroll", "x": args.X, "y": args.Y, "deltaX": args.DeltaX, "deltaY": args.DeltaY}
		case "back", "forward", "reload":
			payload = map[string]any{"type": args.Action}
		default:
			return mcpError(fmt.Errorf("unknown action %q", args.Action))
		}
		return s.browserAction(ctx, client, issue.ID, args.Session, payload)

	case "browser_screenshot":
		session, err := pickSession(protocol.SessionKindBrowser)
		if err != nil {
			return mcpError(err)
		}
		ws, err := dial()
		if err != nil {
			return mcpError(err)
		}
		defer ws.Close()
		snap, err := ws.CollectSnapshot(session.ID, protocol.SessionKindBrowser, 0, 0, 15*time.Second, 500*time.Millisecond)
		if err != nil {
			return mcpError(err)
		}
		if snap.LastData == nil {
			return mcpError(fmt.Errorf("no frame received; is the browser session still loading?"))
		}
		return map[string]any{
			"content": []map[string]any{
				{"type": "image", "data": snap.LastData.Data, "mimeType": snap.LastData.Mime},
				{"type": "text", "text": fmt.Sprintf("url=%s size=%dx%d", snap.URL, snap.LastData.Width, snap.LastData.Height)},
			},
		}

	default:
		return mcpError(fmt.Errorf("unknown tool %q", name))
	}
}

func browserOpenSuffix(url string) string {
	if url == "" {
		return ""
	}
	return ", navigating to " + url
}

func (s *sessionMcpServer) browserAction(ctx context.Context, client *cli.APIClient, issueID, sessionRef string, action map[string]any) map[string]any {
	session, err := resolveIssueSessionRef(ctx, client, issueID, protocol.SessionKindBrowser, strings.TrimSpace(sessionRef))
	if err != nil {
		return mcpError(err)
	}
	ws, err := dialIssueSessionFromCmd(s.cmd, issueID)
	if err != nil {
		return mcpError(err)
	}
	defer ws.Close()
	snap, err := ws.CollectSnapshot(session.ID, protocol.SessionKindBrowser, 0, 0, 15*time.Second, 0)
	if err != nil {
		return mcpError(err)
	}
	if err := sendBrowserAction(ws, session.ID, action); err != nil {
		return mcpError(err)
	}
	if after, err := ws.CollectSnapshot(session.ID, protocol.SessionKindBrowser, 0, 0, 8*time.Second, 700*time.Millisecond); err == nil && after.URL != "" {
		snap = after
	}
	return mcpText("ok url=%s", snap.URL)
}

func init() {
	rootCmd.AddCommand(sessionMcpCmd)
}
