-- Points system, free trial tracking, and competitions

-- ── Free trial message tracking ─────────────────────────────────────────────
-- Tracks how many free messages a guest user has used
alter table users add column if not exists free_messages_used int default 0;
alter table users add column if not exists free_messages_limit int default 20;
alter table users add column if not exists trial_started_at timestamptz;

-- ── Points system ───────────────────────────────────────────────────────────
create table if not exists user_points (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id) on delete cascade,
  category        text not null,  -- 'strength', 'endurance', 'discipline', 'nutrition', 'improvement', 'consistency'
  points          int not null default 0,
  reason          text not null,  -- 'logged_workout', 'hit_protein_target', 'weight_progress', '7_day_streak', etc.
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_user_points_user on user_points(user_id);
create index if not exists idx_user_points_user_cat on user_points(user_id, category);

-- Aggregated points per user (materialized for fast leaderboard queries)
create table if not exists user_points_summary (
  user_id         uuid primary key references users(id) on delete cascade,
  total_points    int default 0,
  strength        int default 0,
  endurance       int default 0,
  discipline      int default 0,
  nutrition       int default 0,
  improvement     int default 0,
  consistency     int default 0,
  current_streak  int default 0,
  best_streak     int default 0,
  improvement_pct numeric default 0,  -- overall % improvement
  updated_at      timestamptz not null default now()
);

-- ── Competitions ────────────────────────────────────────────────────────────
create table if not exists competitions (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  description     text default '',
  start_date      timestamptz not null,
  end_date        timestamptz not null,
  scoring_rules   jsonb default '{}'::jsonb,
  is_active       boolean default true,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

create table if not exists competition_participants (
  id              uuid primary key default uuid_generate_v4(),
  competition_id  uuid not null references competitions(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  points          int default 0,
  rank            int,
  share_stats     boolean default true,  -- opt-in to share stats with group
  joined_at       timestamptz not null default now(),
  unique(competition_id, user_id)
);

create index if not exists idx_comp_parts_comp on competition_participants(competition_id);
create index if not exists idx_comp_parts_user on competition_participants(user_id);
