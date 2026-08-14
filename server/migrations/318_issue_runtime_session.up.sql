-- Shared, durable Terminal / Browser sessions bound to an issue. No FK:
-- relationships and cleanup are enforced in application code. Indexes are
-- created CONCURRENTLY in follow-up migrations.
CREATE TABLE issue_runtime_session (
    id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    issue_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pty', 'browser')),
    daemon_id TEXT NOT NULL,
    runtime_id UUID NOT NULL,
    opened_by UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
    cwd TEXT,
    url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ
);
