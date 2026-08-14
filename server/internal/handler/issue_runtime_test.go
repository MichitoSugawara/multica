package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
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
