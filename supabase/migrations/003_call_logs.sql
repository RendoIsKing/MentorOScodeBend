-- Call logs table for voice/video call history
CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  caller_id UUID NOT NULL REFERENCES public.users(id),
  receiver_id UUID NOT NULL REFERENCES public.users(id),
  conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'rejected', 'missed', 'busy')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_logs_caller ON call_logs(caller_id);
CREATE INDEX idx_call_logs_receiver ON call_logs(receiver_id);
CREATE INDEX idx_call_logs_started ON call_logs(started_at DESC);

-- Enable RLS
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- Users can see their own calls
CREATE POLICY "Users can view own calls" ON call_logs
  FOR SELECT USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- Users can insert calls they initiate
CREATE POLICY "Users can insert own calls" ON call_logs
  FOR INSERT WITH CHECK (auth.uid() = caller_id);

-- Users can update calls they're part of
CREATE POLICY "Users can update own calls" ON call_logs
  FOR UPDATE USING (auth.uid() = caller_id OR auth.uid() = receiver_id);
