CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_runtime_session_issue_status ON issue_runtime_session (issue_id, status);
