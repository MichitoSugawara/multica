-- Bind a shared pane to the agent task that opened it, so the session can be
-- closed when that run reaches a terminal state instead of lingering until the
-- 24h idle TTL. NULL means "opened by a human from the UI" — those stay open
-- deliberately and are only ended by an explicit close or the idle sweeper.
-- No FK by house rule: the relationship is enforced in application code.
ALTER TABLE issue_runtime_session ADD COLUMN IF NOT EXISTS opened_by_task UUID;
