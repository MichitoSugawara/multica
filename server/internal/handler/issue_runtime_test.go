package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/multica-ai/multica/server/internal/auth"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

func TestListIssueRuntimeSessions(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	created := createIssueForTest(t, map[string]any{
		"title":  "runtime sessions list",
		"status": "todo",
	})
	sessionID := uuid.NewString()
	if _, err := testPool.Exec(t.Context(), `
		INSERT INTO issue_runtime_session (
			id, workspace_id, issue_id, kind, daemon_id, runtime_id, opened_by, status, cwd
		) VALUES ($1, $2, $3, 'pty', 'daemon-list', $4, $5, 'open', '/tmp/from-server')
	`, sessionID, testWorkspaceID, created.ID, testRuntimeID, testUserID); err != nil {
		t.Fatalf("insert session: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(t.Context(), `DELETE FROM issue_runtime_session WHERE id = $1`, sessionID)
	})

	w := httptest.NewRecorder()
	req := withURLParam(newRequest("GET", "/api/issues/"+created.ID+"/runtime-sessions", nil), "id", created.ID)
	testHandler.ListIssueRuntimeSessions(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	var payload struct {
		Sessions []IssueRuntimeSessionResponse `json:"sessions"`
	}
	if err := json.NewDecoder(w.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Sessions) != 1 {
		t.Fatalf("sessions = %d, want 1", len(payload.Sessions))
	}
	if payload.Sessions[0].ID != sessionID {
		t.Fatalf("id = %s, want %s", payload.Sessions[0].ID, sessionID)
	}
	if payload.Sessions[0].Cwd == nil || *payload.Sessions[0].Cwd != "/tmp/from-server" {
		t.Fatalf("cwd = %v, want /tmp/from-server", payload.Sessions[0].Cwd)
	}
}

func TestCloseIssueRuntimeSessionRejectsOtherIssue(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	owner := createIssueForTest(t, map[string]any{"title": "session owner", "status": "todo"})
	other := createIssueForTest(t, map[string]any{"title": "session other", "status": "todo"})
	sessionID := uuid.NewString()
	if _, err := testPool.Exec(t.Context(), `
		INSERT INTO issue_runtime_session (
			id, workspace_id, issue_id, kind, daemon_id, runtime_id, opened_by, status
		) VALUES ($1, $2, $3, 'pty', 'daemon-hijack', $4, $5, 'open')
	`, sessionID, testWorkspaceID, owner.ID, testRuntimeID, testUserID); err != nil {
		t.Fatalf("insert session: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(t.Context(), `DELETE FROM issue_runtime_session WHERE id = $1`, sessionID)
	})

	w := httptest.NewRecorder()
	req := withURLParams(
		newRequest("POST", "/api/issues/"+other.ID+"/runtime-sessions/"+sessionID+"/close", nil),
		"id", other.ID, "sessionId", sessionID,
	)
	testHandler.CloseIssueRuntimeSessionHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("hijack close: %d %s", w.Code, w.Body.String())
	}

	var status string
	if err := testPool.QueryRow(t.Context(), `SELECT status FROM issue_runtime_session WHERE id = $1`, sessionID).Scan(&status); err != nil {
		t.Fatalf("status: %v", err)
	}
	if status != "open" {
		t.Fatalf("status = %s, want open (session must stay on the original issue)", status)
	}
}

func TestCreateIssueRuntimeSessionRejectsNonMember(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	created := createIssueForTest(t, map[string]any{"title": "session member gate", "status": "todo"})
	outsider := createRuntimeLocalSkillTestMemberOutsideWorkspace(t)

	w := httptest.NewRecorder()
	req := withURLParam(
		newRequestAsUser(outsider, "POST", "/api/issues/"+created.ID+"/runtime-sessions", map[string]any{
			"kind":       "pty",
			"runtime_id": testRuntimeID,
		}),
		"id", created.ID,
	)
	testHandler.CreateIssueRuntimeSessionHTTP(w, req)
	if w.Code != http.StatusForbidden && w.Code != http.StatusNotFound {
		t.Fatalf("non-member create: %d %s", w.Code, w.Body.String())
	}
}

func TestCreateIssueRuntimeSessionIgnoresClientCwdAndSessionID(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	created := createIssueForTest(t, map[string]any{"title": "session cwd ignore", "status": "todo"})
	clientID := uuid.NewString()
	w := httptest.NewRecorder()
	req := withURLParam(
		newRequest("POST", "/api/issues/"+created.ID+"/runtime-sessions", map[string]any{
			"kind":       "pty",
			"runtime_id": testRuntimeID,
			"cwd":        "/tmp/client-injected",
			"session_id": clientID,
		}),
		"id", created.ID,
	)
	testHandler.CreateIssueRuntimeSessionHTTP(w, req)
	if w.Code == http.StatusCreated {
		var resp IssueRuntimeSessionResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if resp.ID == clientID {
			t.Fatalf("server used client session_id %s", clientID)
		}
		if resp.Cwd != nil && *resp.Cwd == "/tmp/client-injected" {
			t.Fatalf("server stored client cwd")
		}
		t.Cleanup(func() {
			_, _ = testPool.Exec(t.Context(), `DELETE FROM issue_runtime_session WHERE id = $1`, resp.ID)
		})
		return
	}
	// Offline daemon is the common test fixture: nothing must be inserted,
	// especially not under the client-supplied session_id.
	if w.Code != http.StatusServiceUnavailable && w.Code != http.StatusBadRequest && w.Code != http.StatusConflict {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	var n int
	if err := testPool.QueryRow(t.Context(), `SELECT count(*) FROM issue_runtime_session WHERE id = $1`, clientID).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("client session_id was persisted")
	}
}

func TestIssueRuntimeSessionHubReplaysReadyToLateViewer(t *testing.T) {
	hub := newIssueRuntimeSessionHub()
	hub.ensure(&issueRuntimeSession{id: "sess-1", issueID: "issue-1"})

	ready, err := json.Marshal(protocol.SessionReadyPayload{SessionID: "sess-1", Kind: "pty"})
	if err != nil {
		t.Fatal(err)
	}
	hub.broadcast("sess-1", protocol.Message{Type: protocol.EventSessionReady, Payload: ready})

	_, buffered := hub.buffered("sess-1")
	if buffered == nil {
		t.Fatal("ready was dropped because no client was attached yet")
	}
	if buffered.Type != protocol.EventSessionReady {
		t.Fatalf("type = %s, want %s", buffered.Type, protocol.EventSessionReady)
	}
}

// TestResolveIssueSessionTokenTaskToken covers the "mat_" branch: a
// task-scoped agent token minted at claim time must resolve to the owning
// human's user id on the shared-pane viewer socket — this is what the
// session MCP tools (terminal_send / terminal_read / browser_*) dial with
// from inside an agent task.
func TestResolveIssueSessionTokenTaskToken(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	runtimeID := createClaimReclaimRuntime(t, ctx, "Session token runtime")
	agentID, issueID := createClaimReclaimAgentAndIssue(t, ctx, runtimeID, "Session token agent")
	taskID := createDispatchedClaimFixtureTask(t, ctx, agentID, runtimeID, issueID, "1 minute", true)

	token := "mat_" + uuid.NewString()
	if _, err := testPool.Exec(ctx, `
		INSERT INTO task_token (token_hash, task_id, agent_id, workspace_id, user_id, expires_at)
		VALUES ($1, $2, $3, $4, $5, now() + interval '1 hour')
	`, auth.HashToken(token), taskID, agentID, testWorkspaceID, testUserID); err != nil {
		t.Fatalf("insert task token: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(ctx, `DELETE FROM task_token WHERE task_id = $1`, taskID)
	})

	uid, errMsg := testHandler.resolveIssueSessionToken(ctx, token)
	if errMsg != "" {
		t.Fatalf("resolve mat_ token: %s", errMsg)
	}
	if uid != testUserID {
		t.Fatalf("uid = %s, want %s", uid, testUserID)
	}

	// An expired token must be rejected — same query contract as REST auth.
	expired := "mat_" + uuid.NewString()
	if _, err := testPool.Exec(ctx, `
		INSERT INTO task_token (token_hash, task_id, agent_id, workspace_id, user_id, expires_at)
		VALUES ($1, $2, $3, $4, $5, now() - interval '1 minute')
	`, auth.HashToken(expired), taskID, agentID, testWorkspaceID, testUserID); err != nil {
		t.Fatalf("insert expired task token: %v", err)
	}
	if uid, errMsg := testHandler.resolveIssueSessionToken(ctx, expired); errMsg == "" {
		t.Fatalf("expired mat_ token resolved to %s, want rejection", uid)
	}

	// A random unknown token must be rejected.
	if uid, errMsg := testHandler.resolveIssueSessionToken(ctx, "mat_"+uuid.NewString()); errMsg == "" {
		t.Fatalf("unknown mat_ token resolved to %s, want rejection", uid)
	}
}

// TestCloseIssueRuntimeSessionsForTask covers the pane-leak fix: shared panes
// opened BY an agent run must be released when that run reaches a terminal
// state, while panes a human opened on the same issue survive untouched.
//
// Before this, an agent's Terminal / Browser panes stayed 'open' — holding a
// PTY or Chrome process and consuming the per-issue and per-daemon session
// budgets — until the 24h idle sweeper reaped them.
func TestCloseIssueRuntimeSessionsForTask(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()
	runtimeID := createClaimReclaimRuntime(t, ctx, "Session close runtime")
	agentID, issueID := createClaimReclaimAgentAndIssue(t, ctx, runtimeID, "Session close agent")
	taskID := createDispatchedClaimFixtureTask(t, ctx, agentID, runtimeID, issueID, "1 minute", true)

	insertSession := func(kind string, openedByTask any) string {
		t.Helper()
		var id string
		if err := testPool.QueryRow(ctx, `
			INSERT INTO issue_runtime_session (
				id, workspace_id, issue_id, kind, daemon_id, runtime_id,
				opened_by, status, opened_by_task
			)
			VALUES (gen_random_uuid(), $1, $2, $3, 'daemon-close-test', $4, $5, 'open', $6)
			RETURNING id
		`, testWorkspaceID, issueID, kind, runtimeID, testUserID, openedByTask).Scan(&id); err != nil {
			t.Fatalf("insert %s session: %v", kind, err)
		}
		return id
	}

	agentPTY := insertSession("pty", taskID)
	agentBrowser := insertSession("browser", taskID)
	// Opened from the UI by a human: no owning task, so it must survive.
	humanPTY := insertSession("pty", nil)
	t.Cleanup(func() {
		_, _ = testPool.Exec(ctx, `DELETE FROM issue_runtime_session WHERE issue_id = $1`, issueID)
	})

	testHandler.CloseIssueRuntimeSessionsForTask(ctx, parseUUID(taskID))

	statusOf := func(id string) string {
		t.Helper()
		var status string
		if err := testPool.QueryRow(ctx, `SELECT status FROM issue_runtime_session WHERE id = $1`, id).Scan(&status); err != nil {
			t.Fatalf("read session %s: %v", id, err)
		}
		return status
	}

	if got := statusOf(agentPTY); got != "closed" {
		t.Fatalf("agent pty session status = %q, want closed", got)
	}
	if got := statusOf(agentBrowser); got != "closed" {
		t.Fatalf("agent browser session status = %q, want closed", got)
	}
	if got := statusOf(humanPTY); got != "open" {
		t.Fatalf("human-opened session status = %q, want open (must not be reaped by task cleanup)", got)
	}

	// Idempotent: a second terminal callback (complete then fail retry, or a
	// daemon replay) must not error or resurrect anything.
	testHandler.CloseIssueRuntimeSessionsForTask(ctx, parseUUID(taskID))
	if got := statusOf(humanPTY); got != "open" {
		t.Fatalf("human-opened session status after replay = %q, want open", got)
	}
}

func createRuntimeLocalSkillTestMemberOutsideWorkspace(t *testing.T) string {
	t.Helper()
	var userID string
	email := "session-outsider-" + uuid.NewString() + "@multica.ai"
	if err := testPool.QueryRow(t.Context(), `
		INSERT INTO "user" (name, email) VALUES ($1, $2) RETURNING id
	`, "Session Outsider", email).Scan(&userID); err != nil {
		t.Fatalf("insert outsider: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(t.Context(), `DELETE FROM "user" WHERE id = $1`, userID)
	})
	return userID
}
