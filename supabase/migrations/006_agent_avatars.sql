-- Agent avatar images for mentors
-- Mentors upload photos that D-ID uses for lip-sync video generation.
-- Multiple images per mentor → agent rotates between them for variety.

create table if not exists agent_avatars (
  id          uuid primary key default uuid_generate_v4(),
  mentor_id   uuid not null references users(id) on delete cascade,
  url         text not null,
  label       text default '',
  is_active   boolean default true,
  sort_order  int default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_agent_avatars_mentor on agent_avatars(mentor_id) where is_active = true;
