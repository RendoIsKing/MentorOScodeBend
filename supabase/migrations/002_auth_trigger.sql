-- =============================================================================
-- Auth trigger: Sync Supabase auth.users → public.users
-- When a user signs up via Supabase Auth, auto-create a row in public.users.
-- =============================================================================

-- Function that fires AFTER INSERT on auth.users
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (
    auth_id,
    email,
    full_name,
    first_name,
    last_name,
    google_id,
    role,
    status,
    is_active,
    is_verified,
    created_at,
    updated_at
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    case
      when new.raw_app_meta_data ->> 'provider' = 'google'
      then new.raw_user_meta_data ->> 'provider_id'
      else null
    end,
    'user',
    'VISITOR',
    true,
    case
      when new.email_confirmed_at is not null then true
      else false
    end,
    now(),
    now()
  )
  on conflict (auth_id) do nothing;

  return new;
end;
$$;

-- Trigger on the auth.users table
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- =============================================================================
-- RLS Policies for key tables
-- =============================================================================

-- Enable RLS on users table
alter table users enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on users for select
  using (auth.uid() = auth_id);

-- Users can update their own profile
create policy "Users can update own profile"
  on users for update
  using (auth.uid() = auth_id);

-- Service role can do everything (bypasses RLS)
-- No policy needed for service_role as it bypasses RLS by default

-- Enable RLS on chat_messages for realtime
alter table chat_messages enable row level security;

create policy "Users can read messages in their threads"
  on chat_messages for select
  using (
    exists (
      select 1 from chat_threads ct
      where ct.id = chat_messages.thread_id
      and (
        (select u.id from users u where u.auth_id = auth.uid()) = any(ct.participants)
      )
    )
  );

-- Enable RLS on notifications
alter table notifications enable row level security;

create policy "Users can read their notifications"
  on notifications for select
  using (
    (select u.id from users u where u.auth_id = auth.uid()) = any(sent_to)
  );
