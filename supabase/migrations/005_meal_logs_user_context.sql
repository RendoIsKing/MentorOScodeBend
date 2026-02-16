-- =============================================================================
-- 005: Meal Logs + User Context tables
-- Supports: food photo analysis, macro tracking, and agent memory
-- =============================================================================

-- ── MEAL_LOGS ─────────────────────────────────────────────────────────────────
-- Each row = one meal (breakfast/lunch/dinner/snack).
-- items JSONB stores individual food items with per-item macros.

create table if not exists meal_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id),
  date            text not null,                          -- YYYY-MM-DD
  meal_type       text not null default 'snack',          -- breakfast, lunch, dinner, snack
  description     text,                                   -- human-readable summary
  items           jsonb default '[]'::jsonb,              -- [{name, weight_grams, calories, protein_g, carbs_g, fat_g}]
  total_calories  numeric default 0,
  total_protein_g numeric default 0,
  total_carbs_g   numeric default 0,
  total_fat_g     numeric default 0,
  image_url       text,                                   -- optional food photo URL
  is_favorite     boolean default false,
  source          text default 'agent',                   -- 'agent' | 'manual' | 'barcode'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_meal_logs_user_date on meal_logs(user_id, date);
create index if not exists idx_meal_logs_user_fav  on meal_logs(user_id) where is_favorite = true;

-- ── USER_CONTEXT ──────────────────────────────────────────────────────────────
-- Key-value facts the agent remembers about each user.
-- Upsert on (user_id, key) so each fact category has one current value.

create table if not exists user_context (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id),
  key             text not null,                          -- e.g. 'allergy', 'injury', 'preference', 'motivation'
  value           text not null,
  source          text default 'agent',                   -- 'agent' | 'manual' | 'onboarding'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id, key)
);

create index if not exists idx_user_context_user on user_context(user_id);
