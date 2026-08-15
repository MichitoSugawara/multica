CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_runtime_session_task ON issue_runtime_session (opened_by_task) WHERE status = 'open';
