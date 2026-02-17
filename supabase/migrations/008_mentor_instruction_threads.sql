-- Add thread_type and metadata columns to chat_threads for mentor instruction threads
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS thread_type text DEFAULT 'dm';
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_chat_threads_type ON chat_threads(thread_type);
