CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_runtime_id ON issue (runtime_id) WHERE runtime_id IS NOT NULL;
