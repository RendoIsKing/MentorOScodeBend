-- =============================================================================
-- Migration 009: Mentor dashboard features
-- coach_notes, student_tags, safety_flag_logs, discount_codes, push_subscriptions,
-- invite_links, goal_suggestions + subscription_plans enhancements
-- =============================================================================

-- 1. COACH_NOTES (migrated from Mongoose)
create table if not exists coach_notes (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid not null references users(id) on delete cascade,
  client_id   uuid not null references users(id) on delete cascade,
  text        text not null,
  category    text default 'general',
  pinned      boolean not null default false,
  is_deleted  boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_coach_notes_coach_client on coach_notes(coach_id, client_id, created_at desc);
create index idx_coach_notes_pinned on coach_notes(coach_id, client_id, pinned desc, created_at desc);

-- 2. STUDENT_TAGS
create table if not exists student_tags (
  id          uuid primary key default uuid_generate_v4(),
  coach_id    uuid not null references users(id) on delete cascade,
  client_id   uuid not null references users(id) on delete cascade,
  label       text not null,
  color       text default '#6B7280',
  created_at  timestamptz not null default now(),
  unique(coach_id, client_id, label)
);

create index idx_student_tags_coach on student_tags(coach_id);

-- 3. SAFETY_FLAG_LOGS
create table if not exists safety_flag_logs (
  id                uuid primary key default uuid_generate_v4(),
  thread_id         uuid not null references chat_threads(id) on delete cascade,
  message_id        uuid references chat_messages(id),
  student_id        uuid not null references users(id),
  mentor_id         uuid references users(id),
  flag              safety_status not null,
  flagged_categories text[] default '{}',
  action_taken      text,
  override_to       safety_status,
  notes             text,
  created_at        timestamptz not null default now()
);

create index idx_safety_flag_logs_thread on safety_flag_logs(thread_id, created_at desc);
create index idx_safety_flag_logs_student on safety_flag_logs(student_id, created_at desc);

-- 4. DISCOUNT_CODES
create table if not exists discount_codes (
  id              uuid primary key default uuid_generate_v4(),
  mentor_id       uuid not null references users(id) on delete cascade,
  code            text not null,
  discount_percent integer not null default 0,
  discount_amount  numeric default 0,
  max_uses        integer,
  current_uses    integer not null default 0,
  valid_from      timestamptz default now(),
  valid_until     timestamptz,
  plan_id         uuid references subscription_plans(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(mentor_id, code)
);

create index idx_discount_codes_mentor on discount_codes(mentor_id, is_active);

-- 5. PUSH_SUBSCRIPTIONS (browser push)
create table if not exists push_subscriptions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  endpoint    text not null,
  keys        jsonb not null,
  created_at  timestamptz not null default now(),
  unique(user_id, endpoint)
);

-- 6. INVITE_LINKS
create table if not exists invite_links (
  id          uuid primary key default uuid_generate_v4(),
  mentor_id   uuid not null references users(id) on delete cascade,
  code        text not null unique,
  plan_id     uuid references subscription_plans(id),
  clicks      integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_invite_links_code on invite_links(code);

-- 7. GOAL_SUGGESTIONS (mentor -> student)
create table if not exists goal_suggestions (
  id                uuid primary key default uuid_generate_v4(),
  mentor_id         uuid not null references users(id) on delete cascade,
  student_id        uuid not null references users(id) on delete cascade,
  target_weight_kg  numeric,
  strength_targets  text,
  horizon_weeks     integer,
  message           text,
  status            text not null default 'pending',
  responded_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_goal_suggestions_student on goal_suggestions(student_id, status);

-- 8. MENTOR_BRANDING
create table if not exists mentor_branding (
  id              uuid primary key default uuid_generate_v4(),
  mentor_id       uuid not null references users(id) on delete cascade,
  primary_color   text default '#0078D7',
  secondary_color text default '#00AEEF',
  accent_color    text default '#10B981',
  custom_css      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(mentor_id)
);

-- 9. Add trial and tier columns to subscription_plans
alter table subscription_plans add column if not exists trial_days integer default 0;
alter table subscription_plans add column if not exists tier_order integer default 1;
alter table subscription_plans add column if not exists billing_interval text default 'monthly';
alter table subscription_plans add column if not exists yearly_price numeric;

-- 10. Add notification type enrichment
alter table notifications add column if not exists event_type text;
alter table notifications add column if not exists metadata jsonb default '{}'::jsonb;
alter table notifications add column if not exists is_read boolean default false;

-- 11. Add payment info columns to users
alter table users add column if not exists payout_bank_name text;
alter table users add column if not exists payout_account_number text;
alter table users add column if not exists payout_routing_number text;
alter table users add column if not exists stripe_connect_id text;

-- 12. MENTOR_ONBOARDING_CHECKLIST
create table if not exists mentor_checklist (
  id            uuid primary key default uuid_generate_v4(),
  mentor_id     uuid not null references users(id) on delete cascade,
  step_key      text not null,
  completed     boolean not null default false,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique(mentor_id, step_key)
);

-- Apply updated_at triggers to new tables
create trigger trg_coach_notes_updated_at before update on coach_notes for each row execute function update_updated_at_column();
create trigger trg_discount_codes_updated_at before update on discount_codes for each row execute function update_updated_at_column();
create trigger trg_invite_links_updated_at before update on invite_links for each row execute function update_updated_at_column();
create trigger trg_goal_suggestions_updated_at before update on goal_suggestions for each row execute function update_updated_at_column();
create trigger trg_mentor_branding_updated_at before update on mentor_branding for each row execute function update_updated_at_column();

-- Enable realtime on notifications (already added in 001 but ensure it)
-- alter publication supabase_realtime add table notifications;
