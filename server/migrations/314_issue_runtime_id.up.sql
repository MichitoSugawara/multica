-- Bind an issue to a daemon runtime so the detail dock can open a PTY /
-- Chromium session on that machine. Nullable; no FK (relationships are
-- enforced in application code).
ALTER TABLE issue ADD COLUMN IF NOT EXISTS runtime_id UUID;
