-- Add columns for missed-call tracking and video flag
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS seen_by_receiver BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS is_video BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS caller_name TEXT;

-- Index for fast missed-call queries
CREATE INDEX IF NOT EXISTS idx_call_logs_missed
  ON call_logs(receiver_id, seen_by_receiver, status)
  WHERE seen_by_receiver = false AND status IN ('rejected', 'missed', 'busy');
