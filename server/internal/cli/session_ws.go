package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/multica-ai/multica/server/pkg/protocol"
)

// SessionClient is a native (CLI / MCP) viewer of a shared issue runtime
// session — the same WebSocket the web terminal / browser panes attach to
// (GET /api/issues/{id}/runtime-session). One client dials one issue; it can
// attach to any session on that issue.
//
// Reads run on a pump goroutine so callers never set read deadlines on the
// websocket (a tripped read deadline poisons a gorilla connection); timeouts
// are applied with timers around the frame channel instead.
type SessionClient struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
	frames  chan sessionFrame
	done    chan struct{}
	readErr error
}

type sessionFrame struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
	Error   string          `json:"error"`
}

// SessionDataFrame mirrors protocol.SessionDataPayload as received over the
// viewer socket: PTY bytes or a JPEG screencast frame, both base64.
type SessionDataFrame struct {
	SessionID string `json:"session_id"`
	Kind      string `json:"kind"`
	Mime      string `json:"mime"`
	Data      string `json:"data"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
}

// SessionSnapshot is what an attach round-trip yields: the daemon re-dumps
// scrollback (PTY) or the last screencast frame (browser) plus a ready frame
// carrying the current URL for browser sessions.
type SessionSnapshot struct {
	// LargestData is the biggest data frame seen — for PTY sessions the
	// daemon's full-scrollback dump, which subsumes the smaller replayed
	// live chunks the server hub sends first.
	LargestData *SessionDataFrame
	// LastData is the most recent data frame — for browser sessions the
	// freshest JPEG.
	LastData    *SessionDataFrame
	URL         string
	OS          string
	Title       string
	CloseReason string
	Closed      bool
}

// IssueSessionWSURL converts an http(s) API base URL into the ws(s) URL of
// the issue runtime-session endpoint.
func IssueSessionWSURL(serverURL, issueID string) (string, error) {
	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(serverURL), "/"))
	if err != nil {
		return "", fmt.Errorf("parse server URL: %w", err)
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
	default:
		return "", fmt.Errorf("unsupported server URL scheme %q", u.Scheme)
	}
	// The daemon's own config may carry a /ws control path; the session
	// endpoint hangs off the API root.
	u.Path = strings.TrimSuffix(u.Path, "/ws")
	u.Path = strings.TrimRight(u.Path, "/") + "/api/issues/" + url.PathEscape(issueID) + "/runtime-session"
	return u.String(), nil
}

// DialIssueSession opens and authenticates a viewer socket for one issue.
// token may be a user PAT (mul_), a JWT, or a task-scoped agent token (mat_).
func DialIssueSession(ctx context.Context, serverURL, token, issueID string) (*SessionClient, error) {
	wsURL, err := IssueSessionWSURL(serverURL, issueID)
	if err != nil {
		return nil, err
	}
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, resp, err := dialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		if resp != nil {
			return nil, fmt.Errorf("dial session socket: %w (HTTP %d)", err, resp.StatusCode)
		}
		return nil, fmt.Errorf("dial session socket: %w", err)
	}
	c := &SessionClient{
		conn:   conn,
		frames: make(chan sessionFrame, 64),
		done:   make(chan struct{}),
	}
	go c.readLoop()

	if err := c.writeJSON(map[string]any{
		"type":    "auth",
		"payload": map[string]any{"token": token},
	}); err != nil {
		c.Close()
		return nil, fmt.Errorf("send auth: %w", err)
	}
	authTimer := time.NewTimer(10 * time.Second)
	defer authTimer.Stop()
	for {
		select {
		case f, ok := <-c.frames:
			if !ok {
				c.Close()
				return nil, fmt.Errorf("session socket closed during auth: %w", c.readErr)
			}
			switch {
			case f.Type == "auth_ack":
				return c, nil
			case f.Error != "":
				c.Close()
				return nil, fmt.Errorf("session auth rejected: %s", f.Error)
			case f.Type == protocol.EventSessionError:
				c.Close()
				return nil, fmt.Errorf("session error: %s", string(f.Payload))
			}
		case <-authTimer.C:
			c.Close()
			return nil, fmt.Errorf("timed out waiting for session auth ack")
		}
	}
}

func (c *SessionClient) readLoop() {
	defer close(c.frames)
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			c.readErr = err
			close(c.done)
			return
		}
		var f sessionFrame
		if err := json.Unmarshal(raw, &f); err != nil {
			continue
		}
		select {
		case c.frames <- f:
		case <-time.After(5 * time.Second):
			// A stalled consumer must not wedge pong handling forever.
		}
	}
}

func (c *SessionClient) writeJSON(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return c.conn.WriteJSON(v)
}

func (c *SessionClient) writeEvent(eventType string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return c.writeJSON(protocol.Message{Type: eventType, Payload: raw})
}

// Attach subscribes this viewer to an existing session and asks the daemon to
// re-dump its snapshot. Safe to call repeatedly on one connection.
func (c *SessionClient) Attach(sessionID, kind string, cols, rows int) error {
	return c.writeEvent(protocol.EventSessionAttach, protocol.SessionOpenPayload{
		SessionID: sessionID,
		Kind:      kind,
		Cols:      cols,
		Rows:      rows,
	})
}

// SendInput forwards input to the session. For PTY sessions data is base64 of
// raw bytes; for browser sessions data is base64 of a JSON action object.
func (c *SessionClient) SendInput(sessionID, kind, dataB64 string) error {
	return c.writeEvent(protocol.EventSessionInput, protocol.SessionInputPayload{
		SessionID: sessionID,
		Kind:      kind,
		Data:      dataB64,
	})
}

// RequestClose ends the shared session for every viewer.
func (c *SessionClient) RequestClose(sessionID string) error {
	return c.writeEvent(protocol.EventSessionClose, protocol.SessionClosePayload{
		SessionID: sessionID,
	})
}

// Close tears down this viewer's socket. The shared session stays alive.
func (c *SessionClient) Close() {
	_ = c.conn.Close()
}

// CollectSnapshot attaches to the session and gathers frames until the
// snapshot settles: after the ready frame arrives, reading continues until no
// frame lands within settle (or total elapses). total bounds the whole wait
// so a session that never becomes ready still returns an error, not a hang.
func (c *SessionClient) CollectSnapshot(sessionID, kind string, cols, rows int, total, settle time.Duration) (SessionSnapshot, error) {
	if err := c.Attach(sessionID, kind, cols, rows); err != nil {
		return SessionSnapshot{}, fmt.Errorf("attach session: %w", err)
	}
	return c.collect(sessionID, total, settle, false)
}

// WaitClosed drains frames until the session reports closed or total elapses.
func (c *SessionClient) WaitClosed(sessionID string, total time.Duration) (SessionSnapshot, error) {
	return c.collect(sessionID, total, 0, true)
}

func (c *SessionClient) collect(sessionID string, total, settle time.Duration, untilClosed bool) (SessionSnapshot, error) {
	var snap SessionSnapshot
	totalTimer := time.NewTimer(total)
	defer totalTimer.Stop()
	var settleTimer *time.Timer
	var settleCh <-chan time.Time
	ready := false
	gotDataAfterReady := false
	armSettle := func() {
		if settle <= 0 {
			return
		}
		if settleTimer == nil {
			settleTimer = time.NewTimer(settle)
		} else {
			if !settleTimer.Stop() {
				select {
				case <-settleTimer.C:
				default:
				}
			}
			settleTimer.Reset(settle)
		}
		settleCh = settleTimer.C
	}
	defer func() {
		if settleTimer != nil {
			settleTimer.Stop()
		}
	}()

	for {
		select {
		case f, ok := <-c.frames:
			if !ok {
				if ready || snap.Closed {
					return snap, nil
				}
				return snap, fmt.Errorf("session socket closed: %w", c.readErr)
			}
			switch f.Type {
			case protocol.EventSessionData:
				var data SessionDataFrame
				if err := json.Unmarshal(f.Payload, &data); err != nil || data.SessionID != sessionID {
					continue
				}
				cp := data
				snap.LastData = &cp
				if snap.LargestData == nil || len(data.Data) >= len(snap.LargestData.Data) {
					snap.LargestData = &cp
				}
				if ready {
					gotDataAfterReady = true
					armSettle()
				}
			case protocol.EventSessionReady:
				var rd struct {
					SessionID string `json:"session_id"`
					OS        string `json:"os"`
					URL       string `json:"url"`
				}
				if err := json.Unmarshal(f.Payload, &rd); err != nil || rd.SessionID != sessionID {
					continue
				}
				if rd.URL != "" {
					snap.URL = rd.URL
				}
				if rd.OS != "" {
					snap.OS = rd.OS
				}
				ready = true
				armSettle()
				if untilClosed {
					continue
				}
				if settle <= 0 {
					return snap, nil
				}
			case protocol.EventSessionTitle:
				var tt struct {
					SessionID string `json:"session_id"`
					Title     string `json:"title"`
				}
				if err := json.Unmarshal(f.Payload, &tt); err == nil && tt.SessionID == sessionID {
					snap.Title = tt.Title
				}
			case protocol.EventSessionClose:
				var cl struct {
					SessionID string `json:"session_id"`
					Reason    string `json:"reason"`
				}
				if err := json.Unmarshal(f.Payload, &cl); err == nil && (cl.SessionID == "" || cl.SessionID == sessionID) {
					snap.Closed = true
					snap.CloseReason = cl.Reason
					return snap, nil
				}
			case protocol.EventSessionError:
				var se struct {
					SessionID string `json:"session_id"`
					Code      string `json:"code"`
					Message   string `json:"message"`
				}
				if err := json.Unmarshal(f.Payload, &se); err == nil && (se.SessionID == "" || se.SessionID == sessionID) {
					if se.Message != "" {
						return snap, fmt.Errorf("session error %s: %s", se.Code, se.Message)
					}
					return snap, fmt.Errorf("session error: %s", se.Code)
				}
			}
		case <-settleCh:
			if ready && (gotDataAfterReady || !untilClosed) {
				return snap, nil
			}
			settleCh = nil
		case <-totalTimer.C:
			if ready || snap.Closed {
				return snap, nil
			}
			return snap, fmt.Errorf("timed out waiting for session snapshot")
		}
	}
}
