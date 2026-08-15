-- name: CreateIssueRuntimeSession :one
INSERT INTO issue_runtime_session (
    id, workspace_id, issue_id, kind, daemon_id, runtime_id, opened_by,
    status, cwd, url, opened_by_task, last_active_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    'open', $8, $9, $10, now()
)
RETURNING *;

-- name: GetIssueRuntimeSession :one
SELECT * FROM issue_runtime_session
WHERE id = $1 AND issue_id = $2;

-- name: ListOpenIssueRuntimeSessions :many
SELECT * FROM issue_runtime_session
WHERE issue_id = $1 AND status = 'open'
ORDER BY created_at ASC;

-- name: CountOpenIssueRuntimeSessionsByIssue :one
SELECT count(*)::int AS count
FROM issue_runtime_session
WHERE issue_id = $1 AND status = 'open';

-- name: CountOpenIssueRuntimeSessionsByDaemon :one
SELECT count(*)::int AS count
FROM issue_runtime_session
WHERE daemon_id = $1 AND status = 'open';

-- name: ListOpenIssueRuntimeSessionsByDaemon :many
SELECT * FROM issue_runtime_session
WHERE daemon_id = $1 AND status = 'open';

-- name: CloseIssueRuntimeSession :one
UPDATE issue_runtime_session
SET status = 'closed', closed_at = now()
WHERE id = $1 AND status = 'open'
RETURNING *;

-- name: TouchIssueRuntimeSession :exec
UPDATE issue_runtime_session
SET last_active_at = now()
WHERE id = $1 AND status = 'open';

-- name: ListIdleOpenIssueRuntimeSessions :many
SELECT * FROM issue_runtime_session
WHERE status = 'open' AND last_active_at < $1
ORDER BY last_active_at ASC
LIMIT 100;

-- name: UpdateIssueRuntimeSessionURL :exec
UPDATE issue_runtime_session
SET url = $2, last_active_at = now()
WHERE id = $1 AND status = 'open';

-- name: ListOpenIssueRuntimeSessionsByTask :many
SELECT * FROM issue_runtime_session
WHERE opened_by_task = $1 AND status = 'open';
