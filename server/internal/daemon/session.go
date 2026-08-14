package daemon

import (
	"encoding/base64"
	"encoding/json"
	"runtime"
	"sync"
	"time"

	"github.com/multica-ai/multica/server/pkg/protocol"
)

const ptyScrollbackLimit = 1 << 20 // 1 MiB

type runtimeSessionManager struct {
	mu            sync.Mutex
	sessions      map[string]*runtimeDockSession
	pendingAttach map[string][]chan *runtimeDockSession
}

type runtimeDockSession struct {
	id            string
	kind          string
	cancel        func()
	input         func(data string)
	resize        func(cols, rows int)
	dumpSnapshot  func()
	setSubscribed func(bool)
}

type ptyScrollback struct {
	mu  sync.Mutex
	buf []byte
}

func (b *ptyScrollback) append(p []byte) {
	if len(p) == 0 {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buf = append(b.buf, p...)
	if len(b.buf) > ptyScrollbackLimit {
		b.buf = append([]byte(nil), b.buf[len(b.buf)-ptyScrollbackLimit:]...)
	}
}

func (b *ptyScrollback) snapshot() []byte {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]byte, len(b.buf))
	copy(out, b.buf)
	return out
}

func newRuntimeSessionManager() *runtimeSessionManager {
	return &runtimeSessionManager{
		sessions:      make(map[string]*runtimeDockSession),
		pendingAttach: make(map[string][]chan *runtimeDockSession),
	}
}

func (m *runtimeSessionManager) put(s *runtimeDockSession) {
	m.mu.Lock()
	if prev, ok := m.sessions[s.id]; ok {
		prev.cancel()
	}
	m.sessions[s.id] = s
	waiters := m.pendingAttach[s.id]
	delete(m.pendingAttach, s.id)
	m.mu.Unlock()
	for _, ch := range waiters {
		select {
		case ch <- s:
		default:
		}
	}
}

func (m *runtimeSessionManager) wait(id string, timeout time.Duration) *runtimeDockSession {
	m.mu.Lock()
	if s := m.sessions[id]; s != nil {
		m.mu.Unlock()
		return s
	}
	ch := make(chan *runtimeDockSession, 1)
	m.pendingAttach[id] = append(m.pendingAttach[id], ch)
	m.mu.Unlock()

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case s := <-ch:
		return s
	case <-timer.C:
		m.mu.Lock()
		if waiters := m.pendingAttach[id]; len(waiters) > 0 {
			filtered := waiters[:0]
			for _, pending := range waiters {
				if pending != ch {
					filtered = append(filtered, pending)
				}
			}
			if len(filtered) == 0 {
				delete(m.pendingAttach, id)
			} else {
				m.pendingAttach[id] = filtered
			}
		}
		s := m.sessions[id]
		m.mu.Unlock()
		return s
	}
}

func (m *runtimeSessionManager) take(id string) *runtimeDockSession {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.sessions[id]
	delete(m.sessions, id)
	return s
}

func (m *runtimeSessionManager) get(id string) *runtimeDockSession {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessions[id]
}

func (m *runtimeSessionManager) ids() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		out = append(out, id)
	}
	return out
}

// CloseAll kills every local process. Used only when the daemon process itself
// is shutting down — a control-WS flap must not tear sessions down.
func (m *runtimeSessionManager) CloseAll() {
	m.mu.Lock()
	sessions := m.sessions
	m.sessions = make(map[string]*runtimeDockSession)
	m.mu.Unlock()
	for _, s := range sessions {
		s.cancel()
	}
}

func (m *runtimeSessionManager) forwardInput(p protocol.SessionInputPayload) {
	s := m.get(p.SessionID)
	if s == nil || s.input == nil {
		return
	}
	s.input(p.Data)
}

func (m *runtimeSessionManager) forwardResize(p protocol.SessionResizePayload) {
	s := m.get(p.SessionID)
	if s == nil || s.resize == nil {
		return
	}
	s.resize(p.Cols, p.Rows)
}

func (d *Daemon) handleRuntimeSessionFrame(msg protocol.Message) {
	if d.sessions == nil {
		return
	}
	switch msg.Type {
	case protocol.EventDaemonSessionOpen:
		var p protocol.SessionOpenPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			d.logger.Debug("runtime session open payload invalid", "error", err)
			return
		}
		if d.sessions.get(p.SessionID) != nil {
			d.attachRuntimeDockSession(p.SessionID)
			return
		}
		go d.openRuntimeDockSession(p)
	case protocol.EventDaemonSessionAttach:
		var p protocol.SessionOpenPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			d.logger.Debug("runtime session attach payload invalid", "error", err)
			return
		}
		d.attachRuntimeDockSession(p.SessionID)
	case protocol.EventDaemonSessionInput:
		var p protocol.SessionInputPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			d.logger.Debug("runtime session input payload invalid", "error", err)
			return
		}
		d.sessions.forwardInput(p)
	case protocol.EventDaemonSessionResize:
		var p protocol.SessionResizePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		d.sessions.forwardResize(p)
	case protocol.EventDaemonSessionSubscribe:
		var p protocol.SessionSubscribePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		if s := d.sessions.get(p.SessionID); s != nil && s.setSubscribed != nil {
			s.setSubscribed(p.Subscribed)
		}
	case protocol.EventDaemonSessionClose:
		var p protocol.SessionClosePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		if s := d.sessions.take(p.SessionID); s != nil {
			s.cancel()
		}
	}
}

const sessionAttachWait = 15 * time.Second

func (d *Daemon) attachRuntimeDockSession(sessionID string) {
	s := d.sessions.wait(sessionID, sessionAttachWait)
	if s == nil {
		d.sendSessionError(sessionID, protocol.SessionErrorOpenFailed, "session is not running")
		return
	}
	if s.dumpSnapshot != nil {
		s.dumpSnapshot()
		return
	}
	d.sendSessionReady(sessionID, s.kind, "")
}

func (d *Daemon) openRuntimeDockSession(p protocol.SessionOpenPayload) {
	switch p.Kind {
	case protocol.SessionKindPTY:
		d.openPTYSession(p)
	case protocol.SessionKindBrowser:
		d.openBrowserSession(p)
	default:
		d.sendSessionError(p.SessionID, protocol.SessionErrorOpenFailed, "unknown session kind")
	}
}

func (d *Daemon) sendSessionJSON(typ string, payload any) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	frame, err := json.Marshal(protocol.Message{Type: typ, Payload: raw})
	if err != nil {
		return
	}
	if err := d.wsRPC.Enqueue(frame); err != nil {
		d.logger.Debug("runtime session frame dropped", "type", typ, "error", err)
	}
}

func (d *Daemon) sendSessionError(sessionID, code, message string) {
	d.sendSessionJSON(protocol.EventDaemonSessionError, protocol.SessionErrorPayload{
		SessionID: sessionID,
		Code:      code,
		Message:   message,
	})
}

func (d *Daemon) sendSessionReady(sessionID, kind, url string) {
	d.sendSessionJSON(protocol.EventDaemonSessionReady, protocol.SessionReadyPayload{
		SessionID: sessionID,
		Kind:      kind,
		OS:        runtime.GOOS,
		URL:       url,
	})
}

func (d *Daemon) sendSessionClose(sessionID, reason string) {
	d.sendSessionJSON(protocol.EventDaemonSessionClose, protocol.SessionClosePayload{
		SessionID: sessionID,
		Reason:    reason,
	})
	d.sessions.take(sessionID)
}

func (d *Daemon) sendSessionTitle(sessionID, kind, title string) {
	d.sendSessionJSON(protocol.EventDaemonSessionTitle, protocol.SessionTitlePayload{
		SessionID: sessionID,
		Kind:      kind,
		Title:     title,
	})
}

func (d *Daemon) sendLiveSessionSync() {
	if d.sessions == nil {
		return
	}
	d.sendSessionJSON(protocol.EventDaemonSessionSync, protocol.SessionSyncPayload{
		SessionIDs: d.sessions.ids(),
	})
}

func (d *Daemon) sendPTYSnapshot(sessionID string, raw []byte) {
	if len(raw) == 0 {
		d.sendSessionReady(sessionID, protocol.SessionKindPTY, "")
		return
	}
	d.sendSessionJSON(protocol.EventDaemonSessionData, protocol.SessionDataPayload{
		SessionID: sessionID,
		Kind:      protocol.SessionKindPTY,
		Mime:      "application/octet-stream",
		Data:      base64.StdEncoding.EncodeToString(raw),
	})
	d.sendSessionReady(sessionID, protocol.SessionKindPTY, "")
}
