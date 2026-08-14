CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_runtime_session_daemon_status ON issue_runtime_session (daemon_id, status);
