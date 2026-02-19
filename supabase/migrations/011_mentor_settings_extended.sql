-- 011: Extended mentor settings (welcome message, website link, notification prefs)

alter table users add column if not exists welcome_message text;
alter table users add column if not exists website_link text;
alter table users add column if not exists notification_preferences jsonb not null default '{
  "new_subscriber": true,
  "new_message": true,
  "payment_received": true,
  "safety_flag": true
}'::jsonb;
