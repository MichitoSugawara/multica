package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/multica-ai/multica/server/internal/auth"
	"github.com/multica-ai/multica/server/internal/realtime"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

const (
	issueSessionWriteWait  = 10 * time.Second
	issueSessionPongWait   = 60 * time.Second
	issueSessionPingPeriod = (issueSessionPongWait * 9) / 10
	issueSessionReadLimit  = 1 << 20
)

var issueSessionUpgrader = websocket.Upgrader{
	CheckOrigin: realtime.CheckOrigin,
}

type issueRuntimeSessionHub struct {
	mu     sync.Mutex
	byID   map[string]*issueRuntimeSession
	byConn map[*websocket.Conn]map[string]struct{}
}

type issueRuntimeSession struct {
	id          string
	kind        string
	issueID     string
	workspaceID string
	runtimeID   string
	daemonID    string
	clients     map[*websocket.Conn]*issueSessionClient
	lastData    *protocol.Message
	lastReady   *protocol.Message
	lastTitle   *protocol.Message
}

type issueSessionClient struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func newIssueRuntimeSessionHub() *issueRuntimeSessionHub {
	return &issueRuntimeSessionHub{
		byID:   make(map[string]*issueRuntimeSession),
		byConn: make(map[*websocket.Conn]map[string]struct{}),
	}
}

func (c *issueSessionClient) writeJSON(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(issueSessionWriteWait))
	return c.conn.WriteJSON(v)
}

func (hub *issueRuntimeSessionHub) ensure(s *issueRuntimeSession) *issueRuntimeSession {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if existing, ok := hub.byID[s.id]; ok {
		return existing
	}
	if s.clients == nil {
		s.clients = make(map[*websocket.Conn]*issueSessionClient)
	}
	hub.byID[s.id] = s
	return s
}

func (hub *issueRuntimeSessionHub) attach(sessionID string, conn *websocket.Conn) *issueRuntimeSession {
	hub.mu.Lock()
	s := hub.byID[sessionID]
	if s == nil {
		hub.mu.Unlock()
		return nil
	}
	client := &issueSessionClient{conn: conn}
	s.clients[conn] = client
	if hub.byConn[conn] == nil {
		hub.byConn[conn] = make(map[string]struct{})
	}
	hub.byConn[conn][sessionID] = struct{}{}
	replay := make([]protocol.Message, 0, 2)
	if s.lastData != nil {
		replay = append(replay, *s.lastData)
	}
	if s.lastReady != nil {
		replay = append(replay, *s.lastReady)
	}
	if s.lastTitle != nil {
		replay = append(replay, *s.lastTitle)
	}
	hub.mu.Unlock()
	for _, msg := range replay {
		_ = client.writeJSON(msg)
	}
	return s
}

func (hub *issueRuntimeSessionHub) buffered(sessionID string) (data, ready *protocol.Message) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	s := hub.byID[sessionID]
	if s == nil {
		return nil, nil
	}
	return s.lastData, s.lastReady
}

func (hub *issueRuntimeSessionHub) lookup(id string) *issueRuntimeSession {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	return hub.byID[id]
}

func (hub *issueRuntimeSessionHub) lookupOnIssue(sessionID, issueID string) *issueRuntimeSession {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	s := hub.byID[sessionID]
	if s == nil || s.issueID != issueID {
		return nil
	}
	return s
}

func (hub *issueRuntimeSessionHub) dropSession(id string) *issueRuntimeSession {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	s, ok := hub.byID[id]
	if !ok {
		return nil
	}
	delete(hub.byID, id)
	for conn := range s.clients {
		if ids := hub.byConn[conn]; ids != nil {
			delete(ids, id)
			if len(ids) == 0 {
				delete(hub.byConn, conn)
			}
		}
	}
	return s
}

// detachConn removes this websocket from every session. Processes stay alive.
func (hub *issueRuntimeSessionHub) detachConn(conn *websocket.Conn) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	ids := hub.byConn[conn]
	delete(hub.byConn, conn)
	for id := range ids {
		if s, ok := hub.byID[id]; ok {
			delete(s.clients, conn)
		}
	}
}

func (hub *issueRuntimeSessionHub) broadcast(sessionID string, v any) {
	hub.mu.Lock()
	s := hub.byID[sessionID]
	if s == nil {
		hub.mu.Unlock()
		return
	}
	if msg, ok := v.(protocol.Message); ok {
		switch msg.Type {
		case protocol.EventSessionData:
			cp := msg
			s.lastData = &cp
		case protocol.EventSessionReady:
			cp := msg
			s.lastReady = &cp
		case protocol.EventSessionTitle:
			cp := msg
			s.lastTitle = &cp
		case protocol.EventSessionClose:
			s.lastData = nil
			s.lastReady = nil
			s.lastTitle = nil
		}
	}
	clients := make([]*issueSessionClient, 0, len(s.clients))
	for _, c := range s.clients {
		clients = append(clients, c)
	}
	hub.mu.Unlock()
	for _, c := range clients {
		_ = c.writeJSON(v)
	}
}

func (hub *issueRuntimeSessionHub) writeConn(conn *websocket.Conn, v any) {
	hub.mu.Lock()
	var client *issueSessionClient
	for _, s := range hub.byID {
		if c, ok := s.clients[conn]; ok {
			client = c
			break
		}
	}
	hub.mu.Unlock()
	if client != nil {
		_ = client.writeJSON(v)
		return
	}
	_ = conn.SetWriteDeadline(time.Now().Add(issueSessionWriteWait))
	_ = conn.WriteJSON(v)
}

// IssueRuntimeSession upgrades a browser WebSocket and relays PTY / CDP
// frames to a shared issue runtime session. Disconnect detaches this
// viewer only; the daemon process stays up until close or idle TTL.
func (h *Handler) IssueRuntimeSession(w http.ResponseWriter, r *http.Request) {
	issueID := chi.URLParam(r, "id")
	if issueID == "" {
		writeError(w, http.StatusBadRequest, "issue id is required")
		return
	}

	if h.runtimeSessions == nil {
		writeError(w, http.StatusServiceUnavailable, "runtime sessions are not available")
		return
	}

	userID, errMsg, status := h.authenticateIssueSession(r)
	if errMsg != "" && userID == "" {
		if cookie, err := r.Cookie(auth.AuthCookieName); err == nil && cookie.Value != "" {
			http.Error(w, errMsg, status)
			return
		}
	}

	conn, err := issueSessionUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("issue runtime session upgrade failed", "error", err)
		return
	}
	conn.SetReadLimit(issueSessionReadLimit)

	if userID == "" {
		token, firstErr, closed := firstIssueSessionAuth(conn)
		if closed {
			return
		}
		if firstErr != "" {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(firstErr))
			conn.Close()
			return
		}
		uid, authErr := h.resolveIssueSessionToken(r.Context(), token)
		if authErr != "" {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(authErr))
			conn.Close()
			return
		}
		userID = uid
		if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"auth_ack"}`)); err != nil {
			conn.Close()
			return
		}
	}

	issue, ok := h.loadIssueForSession(r.Context(), conn, issueID, userID)
	if !ok {
		return
	}

	conn.SetReadDeadline(time.Now().Add(issueSessionPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(issueSessionPongWait))
		return nil
	})

	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(issueSessionPingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				_ = conn.SetWriteDeadline(time.Now().Add(issueSessionWriteWait))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	defer func() {
		close(done)
		h.runtimeSessions.detachConn(conn)
		conn.Close()
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var msg protocol.Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		h.handleIssueSessionClientFrame(r.Context(), conn, userID, issue, msg)
	}
}

func (h *Handler) handleIssueSessionClientFrame(ctx context.Context, conn *websocket.Conn, userID string, issue db.Issue, msg protocol.Message) {
	issueID := uuidToString(issue.ID)
	switch msg.Type {
	case protocol.EventSessionCreate, protocol.EventSessionOpen:
		var req protocol.SessionOpenPayload
		if err := json.Unmarshal(msg.Payload, &req); err != nil {
			h.writeSessionError(conn, "", protocol.SessionErrorOpenFailed, "invalid create payload")
			return
		}
		req.SessionID = "" // server-assigned; ignore client ids (hijack prevention)
		req.Cwd = ""       // server-assigned from the issue task hint
		row, code, errMsg := h.createIssueRuntimeSession(ctx, userID, issue, req)
		if code != "" {
			h.writeSessionError(conn, "", code, errMsg)
			return
		}
		h.runtimeSessions.attach(uuidToString(row.ID), conn)
	case protocol.EventSessionAttach:
		var req protocol.SessionOpenPayload
		if err := json.Unmarshal(msg.Payload, &req); err != nil {
			h.writeSessionError(conn, "", protocol.SessionErrorOpenFailed, "invalid attach payload")
			return
		}
		h.attachIssueRuntimeSession(ctx, conn, issue, req)
	case protocol.EventSessionInput:
		var req protocol.SessionInputPayload
		if err := json.Unmarshal(msg.Payload, &req); err != nil {
			return
		}
		s := h.runtimeSessions.lookupOnIssue(req.SessionID, issueID)
		if s == nil {
			return
		}
		h.touchIssueRuntimeSession(ctx, req.SessionID)
		h.forwardToOneRuntime(s.runtimeID, protocol.EventDaemonSessionInput, req)
	case protocol.EventSessionResize:
		var req protocol.SessionResizePayload
		if err := json.Unmarshal(msg.Payload, &req); err != nil {
			return
		}
		s := h.runtimeSessions.lookupOnIssue(req.SessionID, issueID)
		if s == nil {
			return
		}
		h.forwardToOneRuntime(s.runtimeID, protocol.EventDaemonSessionResize, req)
	case protocol.EventSessionSubscribe:
		var req protocol.SessionSubscribePayload
		if err := json.Unmarshal(msg.Payload, &req); err != nil {
			return
		}
		s := h.runtimeSessions.lookupOnIssue(req.SessionID, issueID)
		if s == nil {
			return
		}
		h.forwardToOneRuntime(s.runtimeID, protocol.EventDaemonSessionSubscribe, req)
	case protocol.EventSessionClose:
		var req protocol.SessionClosePayload
		if err := json.Unmarshal(msg.Payload, &req); err != nil {
			return
		}
		h.endIssueRuntimeSession(ctx, userID, issue, req.SessionID, "client_close")
	}
}

func (h *Handler) attachIssueRuntimeSession(ctx context.Context, conn *websocket.Conn, issue db.Issue, req protocol.SessionOpenPayload) {
	sessionID, err := util.ParseUUID(strings.TrimSpace(req.SessionID))
	if err != nil {
		h.writeSessionError(conn, req.SessionID, protocol.SessionErrorOpenFailed, "invalid session id")
		return
	}
	row, err := h.Queries.GetIssueRuntimeSession(ctx, db.GetIssueRuntimeSessionParams{
		ID:      sessionID,
		IssueID: issue.ID,
	})
	if err != nil {
		h.writeSessionError(conn, req.SessionID, protocol.SessionErrorForbidden, "session not found")
		return
	}
	if row.Status != "open" {
		h.writeSessionError(conn, req.SessionID, protocol.SessionErrorClosed, "session is closed")
		return
	}
	runtimeID := uuidToString(row.RuntimeID)
	s := h.runtimeSessions.ensure(&issueRuntimeSession{
		id:          uuidToString(row.ID),
		kind:        row.Kind,
		issueID:     uuidToString(issue.ID),
		workspaceID: uuidToString(issue.WorkspaceID),
		runtimeID:   runtimeID,
		daemonID:    row.DaemonID,
	})
	h.runtimeSessions.attach(s.id, conn)
	h.touchIssueRuntimeSession(ctx, s.id)
	open := protocol.SessionOpenPayload{
		SessionID: s.id,
		Kind:      s.kind,
		IssueID:   s.issueID,
		DaemonID:  s.daemonID,
		RuntimeID: runtimeID,
		Cols:      req.Cols,
		Rows:      req.Rows,
	}
	if !h.forwardToOneRuntime(runtimeID, protocol.EventDaemonSessionAttach, open) {
		h.writeSessionError(conn, s.id, protocol.SessionErrorRuntimeOffline, "failed to reach machine")
	}
}

func (h *Handler) writeSessionError(conn *websocket.Conn, sessionID, code, message string) {
	raw, _ := json.Marshal(protocol.SessionErrorPayload{
		SessionID: sessionID,
		Code:      code,
		Message:   message,
	})
	if h.runtimeSessions != nil {
		h.runtimeSessions.writeConn(conn, protocol.Message{Type: protocol.EventSessionError, Payload: raw})
		return
	}
	_ = conn.SetWriteDeadline(time.Now().Add(issueSessionWriteWait))
	_ = conn.WriteJSON(protocol.Message{Type: protocol.EventSessionError, Payload: raw})
}

func (h *Handler) loadIssueForSession(ctx context.Context, conn *websocket.Conn, issueRef, userID string) (db.Issue, bool) {
	issue, err := h.resolveIssueRef(ctx, issueRef)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			h.writeSessionError(conn, "", protocol.SessionErrorForbidden, "issue not found")
		} else {
			h.writeSessionError(conn, "", protocol.SessionErrorOpenFailed, "failed to load issue")
		}
		conn.Close()
		return db.Issue{}, false
	}
	if _, err := h.getWorkspaceMember(ctx, userID, uuidToString(issue.WorkspaceID)); err != nil {
		h.writeSessionError(conn, "", protocol.SessionErrorForbidden, "not a member of this workspace")
		conn.Close()
		return db.Issue{}, false
	}
	return issue, true
}

func (h *Handler) resolveIssueRef(ctx context.Context, issueRef string) (db.Issue, error) {
	id, err := util.ParseUUID(issueRef)
	if err != nil {
		return db.Issue{}, pgx.ErrNoRows
	}
	return h.Queries.GetIssue(ctx, id)
}

func (h *Handler) authenticateIssueSession(r *http.Request) (userID, errMsg string, status int) {
	cookie, err := r.Cookie(auth.AuthCookieName)
	if err != nil || cookie.Value == "" {
		return "", "", 0
	}
	uid, authErr := h.resolveIssueSessionToken(r.Context(), cookie.Value)
	if authErr != "" {
		return "", authErr, http.StatusUnauthorized
	}
	return uid, "", 0
}

func (h *Handler) resolveIssueSessionToken(ctx context.Context, tokenStr string) (string, string) {
	if strings.HasPrefix(tokenStr, "mul_") {
		if h.SessionPAT == nil {
			return "", `{"error":"invalid token"}`
		}
		uid, ok := h.SessionPAT.ResolveToken(ctx, tokenStr)
		if !ok {
			return "", `{"error":"invalid token"}`
		}
		return uid, ""
	}
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return auth.JWTSecret(), nil
	})
	if err != nil || !token.Valid {
		return "", `{"error":"invalid token"}`
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", `{"error":"invalid claims"}`
	}
	uid, ok := claims["sub"].(string)
	if !ok || strings.TrimSpace(uid) == "" {
		return "", `{"error":"invalid claims"}`
	}
	return uid, ""
}

func firstIssueSessionAuth(conn *websocket.Conn) (token, errMsg string, closed bool) {
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	defer conn.SetReadDeadline(time.Time{})
	_, raw, err := conn.ReadMessage()
	if err != nil {
		if errors.Is(err, websocket.ErrReadLimit) {
			conn.Close()
			return "", "", true
		}
		return "", `{"error":"auth timeout or read error"}`, false
	}
	var msg struct {
		Type    string `json:"type"`
		Payload struct {
			Token string `json:"token"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil || msg.Type != "auth" || msg.Payload.Token == "" {
		return "", `{"error":"expected auth message as first frame"}`, false
	}
	return msg.Payload.Token, "", false
}

func (h *Handler) touchIssueRuntimeSession(ctx context.Context, sessionID string) {
	id, err := util.ParseUUID(sessionID)
	if err != nil {
		return
	}
	_ = h.Queries.TouchIssueRuntimeSession(ctx, id)
}
