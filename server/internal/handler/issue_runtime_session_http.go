package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/daemonws"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

const (
	issueRuntimeSessionMaxPerIssue  = 8
	issueRuntimeSessionMaxPerDaemon = 16
	issueRuntimeSessionIdleTTL      = 24 * time.Hour
	issueRuntimeSessionSweepEvery   = 5 * time.Minute
)

type IssueRuntimeSessionResponse struct {
	ID           string  `json:"id"`
	WorkspaceID  string  `json:"workspace_id"`
	IssueID      string  `json:"issue_id"`
	Kind         string  `json:"kind"`
	DaemonID     string  `json:"daemon_id"`
	RuntimeID    string  `json:"runtime_id"`
	OpenedBy     string  `json:"opened_by"`
	Status       string  `json:"status"`
	Cwd          *string `json:"cwd"`
	URL          *string `json:"url"`
	CreatedAt    string  `json:"created_at"`
	LastActiveAt string  `json:"last_active_at"`
	ClosedAt     *string `json:"closed_at"`
}

type listIssueRuntimeSessionsResponse struct {
	Sessions []IssueRuntimeSessionResponse `json:"sessions"`
}

type createIssueRuntimeSessionRequest struct {
	Kind      string `json:"kind"`
	DaemonID  string `json:"daemon_id"`
	RuntimeID string `json:"runtime_id"`
	Cwd       string `json:"cwd"`
	SessionID string `json:"session_id"`
}

func issueRuntimeSessionToResponse(row db.IssueRuntimeSession) IssueRuntimeSessionResponse {
	return IssueRuntimeSessionResponse{
		ID:           uuidToString(row.ID),
		WorkspaceID:  uuidToString(row.WorkspaceID),
		IssueID:      uuidToString(row.IssueID),
		Kind:         row.Kind,
		DaemonID:     row.DaemonID,
		RuntimeID:    uuidToString(row.RuntimeID),
		OpenedBy:     uuidToString(row.OpenedBy),
		Status:       row.Status,
		Cwd:          textToPtr(row.Cwd),
		URL:          textToPtr(row.Url),
		CreatedAt:    timestampToString(row.CreatedAt),
		LastActiveAt: timestampToString(row.LastActiveAt),
		ClosedAt:     timestampToPtr(row.ClosedAt),
	}
}

// ListIssueRuntimeSessions returns open Terminal / Browser sessions for an issue.
func (h *Handler) ListIssueRuntimeSessions(w http.ResponseWriter, r *http.Request) {
	issue, ok := h.loadIssueForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	rows, err := h.Queries.ListOpenIssueRuntimeSessions(r.Context(), issue.ID)
	if err != nil {
		slog.Error("list issue runtime sessions", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	out := make([]IssueRuntimeSessionResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, issueRuntimeSessionToResponse(row))
	}
	writeJSON(w, http.StatusOK, listIssueRuntimeSessionsResponse{Sessions: out})
}

// CreateIssueRuntimeSession starts a shared PTY or browser process on a daemon.
func (h *Handler) CreateIssueRuntimeSessionHTTP(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	issue, ok := h.loadIssueForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var req createIssueRuntimeSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	row, code, msg := h.createIssueRuntimeSession(r.Context(), userID, issue, protocol.SessionOpenPayload{
		Kind:      req.Kind,
		DaemonID:  req.DaemonID,
		RuntimeID: req.RuntimeID,
		// cwd and session_id from the client are ignored
	})
	if code != "" {
		status := http.StatusBadRequest
		switch code {
		case protocol.SessionErrorForbidden:
			status = http.StatusForbidden
		case protocol.SessionErrorRuntimeOffline, protocol.SessionErrorDaemonOutdated, protocol.SessionErrorNoRuntime:
			status = http.StatusServiceUnavailable
		case protocol.SessionErrorLimitReached:
			status = http.StatusConflict
		}
		writeError(w, status, msg)
		return
	}
	writeJSON(w, http.StatusCreated, issueRuntimeSessionToResponse(row))
}

// CloseIssueRuntimeSessionHTTP ends a shared session for every viewer.
func (h *Handler) CloseIssueRuntimeSessionHTTP(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	issue, ok := h.loadIssueForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	sessionID := chi.URLParam(r, "sessionId")
	if _, err := util.ParseUUID(sessionID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	row, ok := h.endIssueRuntimeSession(r.Context(), userID, issue, sessionID, "client_close")
	if !ok {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	writeJSON(w, http.StatusOK, issueRuntimeSessionToResponse(row))
}

func (h *Handler) createIssueRuntimeSession(ctx context.Context, userID string, issue db.Issue, req protocol.SessionOpenPayload) (db.IssueRuntimeSession, string, string) {
	kind := req.Kind
	if kind != protocol.SessionKindPTY && kind != protocol.SessionKindBrowser {
		return db.IssueRuntimeSession{}, protocol.SessionErrorOpenFailed, "unknown session kind"
	}
	member, err := h.getWorkspaceMember(ctx, userID, uuidToString(issue.WorkspaceID))
	if err != nil {
		return db.IssueRuntimeSession{}, protocol.SessionErrorForbidden, "not a workspace member"
	}
	runtime, code, msg := h.resolveSessionRuntime(ctx, issue, member, req)
	if code != "" {
		return db.IssueRuntimeSession{}, code, msg
	}
	runtimeID := uuidToString(runtime.ID)
	daemonID := ""
	if runtime.DaemonID.Valid {
		daemonID = runtime.DaemonID.String
	}
	if daemonID == "" {
		return db.IssueRuntimeSession{}, protocol.SessionErrorNoRuntime, "machine has no daemon"
	}
	if h.DaemonHub == nil || h.DaemonHub.RuntimeConnectionCount(runtimeID) == 0 {
		return db.IssueRuntimeSession{}, protocol.SessionErrorRuntimeOffline, "machine is offline"
	}
	needed := protocol.DaemonCapabilityPTYV1
	if kind == protocol.SessionKindBrowser {
		needed = protocol.DaemonCapabilityBrowserV1
	}
	if !h.DaemonHub.RuntimeHasCapability(runtimeID, needed) {
		return db.IssueRuntimeSession{}, protocol.SessionErrorDaemonOutdated, "daemon does not support this session kind"
	}

	issueCount, err := h.Queries.CountOpenIssueRuntimeSessionsByIssue(ctx, issue.ID)
	if err != nil {
		return db.IssueRuntimeSession{}, protocol.SessionErrorOpenFailed, "failed to count sessions"
	}
	if issueCount >= issueRuntimeSessionMaxPerIssue {
		return db.IssueRuntimeSession{}, protocol.SessionErrorLimitReached, "too many open sessions on this issue"
	}
	daemonCount, err := h.Queries.CountOpenIssueRuntimeSessionsByDaemon(ctx, daemonID)
	if err != nil {
		return db.IssueRuntimeSession{}, protocol.SessionErrorOpenFailed, "failed to count sessions"
	}
	if daemonCount >= issueRuntimeSessionMaxPerDaemon {
		return db.IssueRuntimeSession{}, protocol.SessionErrorLimitReached, "too many open sessions on this machine"
	}

	cwd := ""
	if kind == protocol.SessionKindPTY {
		if hint, hintErr := h.Queries.GetLatestIssueTaskHint(ctx, issue.ID); hintErr == nil && hint.WorkDir.Valid {
			cwd = hint.WorkDir.String
		}
	}

	openedBy, err := util.ParseUUID(userID)
	if err != nil {
		return db.IssueRuntimeSession{}, protocol.SessionErrorOpenFailed, "invalid user"
	}
	sessionID := parseUUID(uuid.NewString())
	row, err := h.Queries.CreateIssueRuntimeSession(ctx, db.CreateIssueRuntimeSessionParams{
		ID:          sessionID,
		WorkspaceID: issue.WorkspaceID,
		IssueID:     issue.ID,
		Kind:        kind,
		DaemonID:    daemonID,
		RuntimeID:   runtime.ID,
		OpenedBy:    openedBy,
		Cwd:         pgtype.Text{String: cwd, Valid: cwd != ""},
		Url:         pgtype.Text{},
	})
	if err != nil {
		slog.Error("create issue runtime session", "error", err)
		return db.IssueRuntimeSession{}, protocol.SessionErrorOpenFailed, "failed to create session"
	}

	h.runtimeSessions.ensure(&issueRuntimeSession{
		id:          uuidToString(row.ID),
		kind:        kind,
		issueID:     uuidToString(issue.ID),
		workspaceID: uuidToString(issue.WorkspaceID),
		runtimeID:   runtimeID,
		daemonID:    daemonID,
	})

	open := protocol.SessionOpenPayload{
		SessionID: uuidToString(row.ID),
		Kind:      kind,
		IssueID:   uuidToString(issue.ID),
		DaemonID:  daemonID,
		RuntimeID: runtimeID,
		Cwd:       cwd,
		Cols:      req.Cols,
		Rows:      req.Rows,
	}
	if !h.forwardToOneRuntime(runtimeID, protocol.EventDaemonSessionOpen, open) {
		_, _ = h.Queries.CloseIssueRuntimeSession(ctx, row.ID)
		h.runtimeSessions.dropSession(uuidToString(row.ID))
		return db.IssueRuntimeSession{}, protocol.SessionErrorRuntimeOffline, "failed to reach machine"
	}

	resp := issueRuntimeSessionToResponse(row)
	h.publish(protocol.EventIssueRuntimeSessionCreated, uuidToString(issue.WorkspaceID), "member", userID, map[string]any{
		"session": resp,
	})
	slog.Info("issue runtime session created",
		"session_id", resp.ID,
		"kind", kind,
		"daemon_id", daemonID,
		"runtime_id", runtimeID,
		"issue_id", resp.IssueID,
		"user_id", userID,
	)
	return row, "", ""
}

func (h *Handler) endIssueRuntimeSession(ctx context.Context, userID string, issue db.Issue, sessionID, reason string) (db.IssueRuntimeSession, bool) {
	id, err := util.ParseUUID(sessionID)
	if err != nil {
		return db.IssueRuntimeSession{}, false
	}
	row, err := h.Queries.GetIssueRuntimeSession(ctx, db.GetIssueRuntimeSessionParams{
		ID:      id,
		IssueID: issue.ID,
	})
	if err != nil {
		return db.IssueRuntimeSession{}, false
	}
	closed, err := h.Queries.CloseIssueRuntimeSession(ctx, id)
	if err != nil {
		if row.Status == "closed" {
			return row, true
		}
		return db.IssueRuntimeSession{}, false
	}
	runtimeID := uuidToString(closed.RuntimeID)
	if s := h.runtimeSessions.lookup(sessionID); s != nil {
		runtimeID = s.runtimeID
	}
	closePayload, _ := json.Marshal(protocol.SessionClosePayload{SessionID: sessionID, Reason: reason})
	h.runtimeSessions.broadcast(sessionID, protocol.Message{Type: protocol.EventSessionClose, Payload: closePayload})
	h.runtimeSessions.dropSession(sessionID)
	h.forwardToOneRuntime(runtimeID, protocol.EventDaemonSessionClose, protocol.SessionClosePayload{
		SessionID: sessionID,
		Reason:    reason,
	})
	resp := issueRuntimeSessionToResponse(closed)
	h.publish(protocol.EventIssueRuntimeSessionClosed, uuidToString(issue.WorkspaceID), "member", userID, map[string]any{
		"session": resp,
	})
	slog.Info("issue runtime session closed",
		"session_id", sessionID,
		"kind", closed.Kind,
		"daemon_id", closed.DaemonID,
		"reason", reason,
		"user_id", userID,
	)
	return closed, true
}

func (h *Handler) resolveSessionRuntime(ctx context.Context, issue db.Issue, member db.Member, req protocol.SessionOpenPayload) (db.AgentRuntime, string, string) {
	daemonID := strings.TrimSpace(req.DaemonID)
	if daemonID != "" {
		runtimes, err := h.Queries.ListAgentRuntimesByDaemon(ctx, db.ListAgentRuntimesByDaemonParams{
			WorkspaceID: issue.WorkspaceID,
			DaemonID:    pgtype.Text{String: daemonID, Valid: true},
		})
		if err != nil {
			return db.AgentRuntime{}, protocol.SessionErrorOpenFailed, "failed to load machine"
		}
		if len(runtimes) == 0 {
			return db.AgentRuntime{}, protocol.SessionErrorNoRuntime, "machine not found in this workspace"
		}
		var usable []db.AgentRuntime
		for _, rt := range runtimes {
			if canUseRuntimeForAgent(member, rt) {
				usable = append(usable, rt)
			}
		}
		if len(usable) == 0 {
			return db.AgentRuntime{}, protocol.SessionErrorForbidden, "machine is not usable by this member"
		}
		if h.DaemonHub != nil {
			for _, rt := range usable {
				if h.DaemonHub.RuntimeConnectionCount(uuidToString(rt.ID)) > 0 {
					return rt, "", ""
				}
			}
		}
		return db.AgentRuntime{}, protocol.SessionErrorRuntimeOffline, "machine is offline"
	}

	runtimeID := strings.TrimSpace(req.RuntimeID)
	if runtimeID == "" {
		return db.AgentRuntime{}, protocol.SessionErrorNoRuntime, "no machine selected"
	}
	runtimeUUID, err := util.ParseUUID(runtimeID)
	if err != nil {
		return db.AgentRuntime{}, protocol.SessionErrorOpenFailed, "invalid runtime id"
	}
	runtime, err := h.Queries.GetAgentRuntimeForWorkspace(ctx, db.GetAgentRuntimeForWorkspaceParams{
		ID:          runtimeUUID,
		WorkspaceID: issue.WorkspaceID,
	})
	if err != nil {
		return db.AgentRuntime{}, protocol.SessionErrorNoRuntime, "runtime not found in this workspace"
	}
	if !canUseRuntimeForAgent(member, runtime) {
		return db.AgentRuntime{}, protocol.SessionErrorForbidden, "machine is not usable by this member"
	}
	return runtime, "", ""
}

func (h *Handler) HandleDaemonSessionFrame(identity daemonws.ClientIdentity, msg protocol.Message) {
	switch msg.Type {
	case protocol.EventDaemonSessionReady:
		var p protocol.SessionReadyPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		h.runtimeSessions.broadcast(p.SessionID, protocol.Message{Type: protocol.EventSessionReady, Payload: msg.Payload})
	case protocol.EventDaemonSessionData:
		var p protocol.SessionDataPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		h.runtimeSessions.broadcast(p.SessionID, protocol.Message{Type: protocol.EventSessionData, Payload: msg.Payload})
	case protocol.EventDaemonSessionClose:
		var p protocol.SessionClosePayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		h.closeSessionFromDaemon(p.SessionID, p.Reason)
	case protocol.EventDaemonSessionError:
		var p protocol.SessionErrorPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		h.runtimeSessions.broadcast(p.SessionID, protocol.Message{Type: protocol.EventSessionError, Payload: msg.Payload})
		if p.Code == protocol.SessionErrorClosed || p.Code == protocol.SessionErrorOpenFailed ||
			p.Code == protocol.SessionErrorChromeMissing || p.Code == protocol.SessionErrorUnsupportedOS {
			h.closeSessionFromDaemon(p.SessionID, p.Code)
		}
	case protocol.EventDaemonSessionSync:
		var p protocol.SessionSyncPayload
		if err := json.Unmarshal(msg.Payload, &p); err != nil {
			return
		}
		h.reconcileDaemonSessions(identity.DaemonID, p.SessionIDs)
	}
}

func (h *Handler) closeSessionFromDaemon(sessionID, reason string) {
	id, err := util.ParseUUID(sessionID)
	if err != nil {
		return
	}
	closed, err := h.Queries.CloseIssueRuntimeSession(context.Background(), id)
	closePayload, _ := json.Marshal(protocol.SessionClosePayload{SessionID: sessionID, Reason: reason})
	h.runtimeSessions.broadcast(sessionID, protocol.Message{Type: protocol.EventSessionClose, Payload: closePayload})
	h.runtimeSessions.dropSession(sessionID)
	if err != nil {
		return
	}
	h.publish(protocol.EventIssueRuntimeSessionClosed, uuidToString(closed.WorkspaceID), "system", "", map[string]any{
		"session": issueRuntimeSessionToResponse(closed),
	})
}

func (h *Handler) reconcileDaemonSessions(daemonID string, liveIDs []string) {
	if daemonID == "" {
		return
	}
	live := make(map[string]struct{}, len(liveIDs))
	for _, id := range liveIDs {
		if id != "" {
			live[id] = struct{}{}
		}
	}
	rows, err := h.Queries.ListOpenIssueRuntimeSessionsByDaemon(context.Background(), daemonID)
	if err != nil {
		slog.Error("list open sessions for daemon sync", "daemon_id", daemonID, "error", err)
		return
	}
	for _, row := range rows {
		id := uuidToString(row.ID)
		if _, ok := live[id]; ok {
			continue
		}
		h.closeSessionFromDaemon(id, "daemon_missing")
	}
}

func (h *Handler) forwardToOneRuntime(runtimeID, typ string, payload any) bool {
	if h.DaemonHub == nil {
		return false
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return false
	}
	frame, err := json.Marshal(protocol.Message{Type: typ, Payload: raw})
	if err != nil {
		return false
	}
	return h.DaemonHub.TrySendToOneRuntime(runtimeID, frame)
}

// StartIssueRuntimeSessionSweeper closes sessions idle longer than the TTL.
func (h *Handler) StartIssueRuntimeSessionSweeper(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(issueRuntimeSessionSweepEvery)
		defer ticker.Stop()
		h.sweepIdleIssueRuntimeSessions(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.sweepIdleIssueRuntimeSessions(ctx)
			}
		}
	}()
}

func (h *Handler) sweepIdleIssueRuntimeSessions(ctx context.Context) {
	cutoff := pgtype.Timestamptz{Time: time.Now().Add(-issueRuntimeSessionIdleTTL), Valid: true}
	rows, err := h.Queries.ListIdleOpenIssueRuntimeSessions(ctx, cutoff)
	if err != nil {
		slog.Error("list idle issue runtime sessions", "error", err)
		return
	}
	for _, row := range rows {
		h.closeSessionFromDaemon(uuidToString(row.ID), "idle_ttl")
		h.forwardToOneRuntime(uuidToString(row.RuntimeID), protocol.EventDaemonSessionClose, protocol.SessionClosePayload{
			SessionID: uuidToString(row.ID),
			Reason:    "idle_ttl",
		})
	}
}
