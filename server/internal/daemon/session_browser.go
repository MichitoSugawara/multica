package daemon

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

func (d *Daemon) openBrowserSession(p protocol.SessionOpenPayload) {
	chrome, err := findChromium()
	if err != nil {
		d.sendSessionError(p.SessionID, protocol.SessionErrorChromeMissing, err.Error())
		return
	}

	userDir, err := os.MkdirTemp("", "multica-chrome-*")
	if err != nil {
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "could not create chrome profile")
		return
	}

	width, height := p.Cols, p.Rows
	if width <= 0 {
		width = 1280
	}
	if height <= 0 {
		height = 800
	}

	cmd := exec.Command(chrome, chromiumLaunchArgs(userDir, width, height)...)
	cmd.Dir = userDir
	stderr, err := cmd.StderrPipe()
	if err != nil {
		_ = os.RemoveAll(userDir)
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "could not capture chrome logs")
		return
	}
	if err := cmd.Start(); err != nil {
		_ = os.RemoveAll(userDir)
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, err.Error())
		return
	}

	wsURL, err := waitDevToolsWSURL(filepath.Join(userDir, "DevToolsActivePort"), stderr, 8*time.Second)
	if err != nil {
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(userDir)
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "chrome did not open a debug port")
		return
	}

	cdp, err := dialCDP(wsURL)
	if err != nil {
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(userDir)
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "could not connect to chrome debugger")
		return
	}

	startURL := strings.TrimSpace(p.URL)
	if startURL == "" {
		startURL = "about:blank"
	}

	var currentURL atomic.Value
	currentURL.Store(startURL)
	var lastFrame atomic.Value
	var subscribed atomic.Bool
	subscribed.Store(true)

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			cdp.close()
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			_ = os.RemoveAll(userDir)
		})
	}

	sendLastFrame := func() {
		frame, ok := lastFrame.Load().(protocol.SessionDataPayload)
		if !ok || frame.Data == "" {
			return
		}
		d.sendSessionJSON(protocol.EventDaemonSessionData, frame)
	}

	sess := &runtimeDockSession{
		id:     p.SessionID,
		kind:   protocol.SessionKindBrowser,
		cancel: cancel,
		input:  func(data string) { go handleBrowserInput(cdp, data) },
		resize: func(cols, rows int) {
			if cols <= 0 || rows <= 0 {
				return
			}
			go applyBrowserViewport(cdp, cols, rows)
		},
		setSubscribed: func(on bool) {
			subscribed.Store(on)
			if on {
				sendLastFrame()
			}
		},
		dumpSnapshot: func() {
			url, _ := currentURL.Load().(string)
			sendLastFrame()
			d.sendSessionReady(p.SessionID, protocol.SessionKindBrowser, url)
		},
	}

	cdp.onEvent = func(method string, params json.RawMessage) {
		switch method {
		case "Page.frameNavigated":
			var nav struct {
				Frame struct {
					ID       string `json:"id"`
					ParentID string `json:"parentId"`
					URL      string `json:"url"`
				} `json:"frame"`
			}
			if err := json.Unmarshal(params, &nav); err != nil {
				return
			}
			if nav.Frame.ParentID == "" && nav.Frame.URL != "" {
				currentURL.Store(nav.Frame.URL)
			}
		case "Page.screencastFrame":
			var frame struct {
				Data      string `json:"data"`
				SessionID int    `json:"sessionId"`
				Metadata  struct {
					DeviceWidth  int `json:"deviceWidth"`
					DeviceHeight int `json:"deviceHeight"`
				} `json:"metadata"`
			}
			if err := json.Unmarshal(params, &frame); err != nil {
				return
			}
			// Ack must not wait for a CDP response: call() from onEvent deadlocks
			// the read loop.
			_ = cdp.notify("Page.screencastFrameAck", map[string]any{"sessionId": frame.SessionID})
			payload := protocol.SessionDataPayload{
				SessionID: p.SessionID,
				Kind:      protocol.SessionKindBrowser,
				Mime:      "image/jpeg",
				Data:      frame.Data,
				Width:     frame.Metadata.DeviceWidth,
				Height:    frame.Metadata.DeviceHeight,
			}
			lastFrame.Store(payload)
			if subscribed.Load() {
				d.sendSessionJSON(protocol.EventDaemonSessionData, payload)
			}
		}
	}

	go func() {
		err := cdp.readLoop()
		cancel()
		if err != nil {
			d.logger.Debug("chrome cdp ended", "session_id", p.SessionID, "error", err)
		}
		d.sendSessionClose(p.SessionID, "browser_exit")
	}()

	if err := cdp.call("Page.enable", nil); err != nil {
		cancel()
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "chrome page target failed")
		return
	}
	_ = cdp.call("Runtime.enable", nil)
	if err := applyBrowserViewport(cdp, width, height); err != nil {
		cancel()
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "chrome screencast failed")
		return
	}
	if err := cdp.call("Page.navigate", map[string]any{"url": startURL}); err != nil {
		cancel()
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "chrome navigation failed")
		return
	}

	d.sessions.put(sess)
	d.sendSessionReady(p.SessionID, protocol.SessionKindBrowser, startURL)
}

func chromiumLaunchArgs(userDir string, width, height int) []string {
	return []string{
		"--headless=new",
		"--disable-gpu",
		"--disable-dev-shm-usage",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-background-networking",
		"--disable-extensions",
		"--remote-debugging-port=0",
		"--remote-allow-origins=*",
		"--user-data-dir=" + userDir,
		fmt.Sprintf("--window-size=%d,%d", width, height),
		"about:blank",
	}
}

func applyBrowserViewport(cdp *cdpConn, width, height int) error {
	if err := cdp.call("Emulation.setDeviceMetricsOverride", map[string]any{
		"width":             width,
		"height":            height,
		"deviceScaleFactor": 1,
		"mobile":            false,
	}); err != nil {
		return err
	}
	return cdp.call("Page.startScreencast", map[string]any{
		"format":        "jpeg",
		"quality":       55,
		"maxWidth":      width,
		"maxHeight":     height,
		"everyNthFrame": 1,
	})
}

func findChromium() (string, error) {
	if p := strings.TrimSpace(os.Getenv("MULTICA_CHROMIUM_PATH")); p != "" {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, nil
		}
	}
	names := []string{"google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"}
	if runtime.GOOS == "darwin" {
		names = append([]string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		}, names...)
	}
	if runtime.GOOS == "windows" {
		names = append([]string{
			`C:\Program Files\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
			`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
		}, names...)
	}
	for _, name := range names {
		if filepath.IsAbs(name) {
			if st, err := os.Stat(name); err == nil && !st.IsDir() {
				return name, nil
			}
			continue
		}
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}
	if p := findPlaywrightChromium(); p != "" {
		return p, nil
	}
	return "", errors.New("chrome is not installed")
}

func findPlaywrightChromium() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	roots := []string{
		filepath.Join(home, "Library", "Caches", "ms-playwright"),
		filepath.Join(home, ".cache", "ms-playwright"),
	}
	for _, root := range roots {
		matches, _ := filepath.Glob(filepath.Join(root, "chromium-*", "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"))
		if len(matches) > 0 {
			return matches[0]
		}
		matches, _ = filepath.Glob(filepath.Join(root, "chromium-*", "chrome-linux", "chrome"))
		if len(matches) > 0 {
			return matches[0]
		}
	}
	return ""
}

func parseDevToolsListeningURL(line string) string {
	const prefix = "DevTools listening on "
	idx := strings.Index(line, prefix)
	if idx < 0 {
		return ""
	}
	u := strings.TrimSpace(line[idx+len(prefix):])
	if strings.HasPrefix(u, "ws://") || strings.HasPrefix(u, "wss://") {
		return u
	}
	return ""
}

func waitDevToolsWSURL(portFile string, stderr io.Reader, timeout time.Duration) (string, error) {
	wsCh := make(chan string, 1)
	if stderr != nil {
		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				if u := parseDevToolsListeningURL(scanner.Text()); u != "" {
					select {
					case wsCh <- u:
					default:
					}
					return
				}
			}
		}()
	}

	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case u := <-wsCh:
			if page := resolvePageDevToolsURL(u); page != "" {
				return page, nil
			}
		case <-ticker.C:
			if u := devToolsURLFromPortFile(portFile); u != "" {
				return u, nil
			}
			if time.Now().After(deadline) {
				return "", errors.New("timeout waiting for DevTools")
			}
		}
	}
}

func devToolsURLFromPortFile(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	if !scanner.Scan() {
		return ""
	}
	port, err := strconv.Atoi(strings.TrimSpace(scanner.Text()))
	if err != nil || port <= 0 {
		return ""
	}
	wsURL, err := fetchPageDevToolsWSURL(port)
	if err != nil {
		return ""
	}
	return wsURL
}

func resolvePageDevToolsURL(wsURL string) string {
	if strings.Contains(wsURL, "/devtools/page/") {
		return wsURL
	}
	u, err := url.Parse(wsURL)
	if err != nil {
		return ""
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port <= 0 {
		return ""
	}
	page, err := fetchPageDevToolsWSURL(port)
	if err != nil {
		return ""
	}
	return page
}

func fetchPageDevToolsWSURL(port int) (string, error) {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	listURL := fmt.Sprintf("http://127.0.0.1:%d/json/list", port)
	resp, err := client.Get(listURL)
	if err != nil {
		return "", err
	}
	var targets []struct {
		Type                 string `json:"type"`
		WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	}
	err = json.NewDecoder(resp.Body).Decode(&targets)
	_ = resp.Body.Close()
	if err != nil {
		return "", err
	}
	for _, target := range targets {
		if target.Type == "page" && target.WebSocketDebuggerURL != "" {
			return target.WebSocketDebuggerURL, nil
		}
	}

	req, err := http.NewRequest(http.MethodPut, fmt.Sprintf("http://127.0.0.1:%d/json/new?about:blank", port), nil)
	if err != nil {
		return "", err
	}
	created, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer created.Body.Close()
	var page struct {
		WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	}
	if err := json.NewDecoder(created.Body).Decode(&page); err != nil {
		return "", err
	}
	if page.WebSocketDebuggerURL == "" {
		return "", errors.New("missing page webSocketDebuggerUrl")
	}
	return page.WebSocketDebuggerURL, nil
}

type cdpConn struct {
	conn    *websocket.Conn
	mu      sync.Mutex
	nextID  atomic.Int64
	pending map[int64]chan cdpResponse
	onEvent func(method string, params json.RawMessage)
}

type cdpResponse struct {
	ID     int64           `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func dialCDP(wsURL string) (*cdpConn, error) {
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return nil, err
	}
	return &cdpConn{
		conn:    conn,
		pending: make(map[int64]chan cdpResponse),
	}, nil
}

func (c *cdpConn) close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.Close()
}

func (c *cdpConn) notify(method string, params any) error {
	id := c.nextID.Add(1)
	msg := map[string]any{"id": id, "method": method}
	if params != nil {
		msg["params"] = params
	}
	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn.WriteMessage(websocket.TextMessage, raw)
}

func (c *cdpConn) call(method string, params any) error {
	id := c.nextID.Add(1)
	ch := make(chan cdpResponse, 1)
	c.mu.Lock()
	c.pending[id] = ch
	c.mu.Unlock()
	msg := map[string]any{"id": id, "method": method}
	if params != nil {
		msg["params"] = params
	}
	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	c.mu.Lock()
	err = c.conn.WriteMessage(websocket.TextMessage, raw)
	c.mu.Unlock()
	if err != nil {
		return err
	}
	select {
	case resp := <-ch:
		if resp.Error != nil {
			return errors.New(resp.Error.Message)
		}
		return nil
	case <-time.After(8 * time.Second):
		return errors.New("cdp timeout: " + method)
	}
}

func (c *cdpConn) readLoop() error {
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return err
		}
		var resp cdpResponse
		if err := json.Unmarshal(raw, &resp); err != nil {
			continue
		}
		if resp.ID != 0 {
			c.mu.Lock()
			ch := c.pending[resp.ID]
			delete(c.pending, resp.ID)
			c.mu.Unlock()
			if ch != nil {
				ch <- resp
			}
			continue
		}
		if resp.Method != "" && c.onEvent != nil {
			c.onEvent(resp.Method, resp.Params)
		}
	}
}

type browserInput struct {
	Type      string  `json:"type"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Button    string  `json:"button"`
	Key       string  `json:"key"`
	Code      string  `json:"code"`
	Text      string  `json:"text"`
	URL       string  `json:"url"`
	DeltaX    float64 `json:"deltaX"`
	DeltaY    float64 `json:"deltaY"`
	Modifiers int     `json:"modifiers"`
}

func handleBrowserInput(cdp *cdpConn, data string) {
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		raw = []byte(data)
	}
	var in browserInput
	if err := json.Unmarshal(raw, &in); err != nil {
		return
	}
	switch in.Type {
	case "navigate":
		url := strings.TrimSpace(in.URL)
		if url == "" {
			return
		}
		if !strings.Contains(url, "://") {
			url = "https://" + url
		}
		_ = cdp.call("Page.navigate", map[string]any{"url": url})
	case "back":
		_ = cdp.call("Runtime.evaluate", map[string]any{"expression": "history.back()"})
	case "forward":
		_ = cdp.call("Runtime.evaluate", map[string]any{"expression": "history.forward()"})
	case "reload":
		_ = cdp.call("Page.reload", map[string]any{})
	case "click", "mousedown", "mouseup", "mousemove":
		typ := "mouseMoved"
		switch in.Type {
		case "click":
			_ = cdp.call("Input.dispatchMouseEvent", map[string]any{
				"type": "mousePressed", "x": in.X, "y": in.Y, "button": buttonOrLeft(in.Button), "clickCount": 1,
			})
			typ = "mouseReleased"
		case "mousedown":
			typ = "mousePressed"
		case "mouseup":
			typ = "mouseReleased"
		}
		_ = cdp.call("Input.dispatchMouseEvent", map[string]any{
			"type": typ, "x": in.X, "y": in.Y, "button": buttonOrLeft(in.Button), "clickCount": 1,
		})
	case "scroll":
		_ = cdp.call("Input.dispatchMouseEvent", map[string]any{
			"type": "mouseWheel", "x": in.X, "y": in.Y, "deltaX": in.DeltaX, "deltaY": in.DeltaY,
		})
	case "keydown", "keyup":
		typ := "keyDown"
		if in.Type == "keyup" {
			typ = "keyUp"
		}
		params := map[string]any{
			"type":                  typ,
			"key":                   in.Key,
			"code":                  in.Code,
			"windowsVirtualKeyCode": 0,
			"modifiers":             in.Modifiers,
		}
		if in.Text != "" && in.Type == "keydown" {
			params["text"] = in.Text
			params["type"] = "keyDown"
		}
		_ = cdp.call("Input.dispatchKeyEvent", params)
	}
}

func buttonOrLeft(button string) string {
	if button == "" {
		return "left"
	}
	return button
}
