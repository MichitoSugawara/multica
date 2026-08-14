CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_runtime_session_idle ON issue_runtime_session (last_active_at) WHERE status = 'open';
