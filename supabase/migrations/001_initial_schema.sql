-- =============================================================================
-- Mentorio: Full PostgreSQL schema (migrated from MongoDB/Mongoose)
-- Run this in Supabase SQL Editor to create all tables.
-- =============================================================================

-- Extensions (should already be enabled)
create extension if not exists "uuid-ossp";
create extension if not exists vector;
create extension if not exists pg_trgm;

-- =============================================================================
-- ENUMS
-- =============================================================================

create type user_role as enum ('user', 'admin', 'mentor', 'superadmin');
create type user_status as enum ('VISITOR', 'LEAD', 'TRIAL', 'SUBSCRIBED');
create type post_privacy as enum ('FOLLOWERS', 'FRIENDS', 'PRIVATE', 'PUBLIC', 'SUBSCRIBER', 'PAY_PER_VIEW');
create type post_status as enum ('DRAFT', 'FLAGGED', 'PUBLISHED', 'RESTRICTED', 'UNPUBLISHED');
create type post_type as enum ('POST', 'STORY');
create type media_type as enum ('IMAGE', 'LIVE', 'VIDEO', 'STORY');
create type interaction_type as enum ('LIKE_POST', 'LIKE_STORY', 'COMMENT', 'COLLECTION_SAVED', 'LIKE_COMMENT', 'IMPRESSION', 'VIEW');
create type transaction_status as enum ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
create type transaction_type_enum as enum ('DEBIT', 'CREDIT');
create type product_type as enum ('POSTS', 'SUBSCRIPTION', 'TIPS');
create type subscription_status as enum ('ACTIVE', 'INACTIVE', 'PAUSED', 'CANCEL');
create type plan_type as enum ('BASIC_FREE', 'FIXED', 'CUSTOM');
create type document_type as enum ('ID', 'PASSPORT', 'DRIVER_LICENSE', 'OTHER');
create type document_status as enum ('Pending', 'Approved', 'Rejected');
create type safety_status as enum ('green', 'yellow', 'red');
create type action_type as enum ('NOT_INTERESTED', 'REPORT', 'USER_QUERY');
create type report_status as enum ('APPROVED', 'CANCEL', 'PENDING');
create type report_reason as enum ('FRAUD', 'HATE_OR_HARASSMENT', 'INTELLECTUAL_PROPERTY_VIOLATION', 'OTHER', 'PRETENDING_TO_BE_SOMEONE_ELSE', 'REGULATED_GOODS_AND_ACTIVITIES', 'SPAM', 'VIOLENCE');
create type moderation_status as enum ('open', 'resolved');
create type knowledge_type as enum ('text', 'pdf', 'docx', 'txt');
create type knowledge_classification as enum ('system_prompt', 'rag');
create type change_event_type as enum ('PLAN_EDIT', 'NUTRITION_EDIT', 'WEIGHT_LOG', 'WORKOUT_LOG', 'GOAL_EDIT');
create type plan_source as enum ('preview', 'rule', 'manual', 'action');
create type goal_type as enum ('cut', 'maintain', 'gain');
create type experience_level as enum ('beginner', 'intermediate', 'advanced');
create type diet_type as enum ('regular', 'vegan', 'vegetarian', 'keto', 'none');
create type file_format_type as enum ('JSON', 'TEXT');

-- =============================================================================
-- 1. FILES
-- =============================================================================

create table files (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,                          -- MongoDB ObjectId for migration
  path        text not null,
  is_deleted  boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- 2. MODULES
-- =============================================================================

create table modules (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  title       text not null,
  is_deleted  boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- 3. INTERESTS
-- =============================================================================

create table interests (
  id           uuid primary key default uuid_generate_v4(),
  legacy_id    text,
  title        text,
  slug         text,
  added_by     uuid,                         -- FK to users (added later)
  is_available boolean not null default true,
  is_deleted   boolean not null default false,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =============================================================================
-- 4. FEATURES
-- =============================================================================

create table features (
  id                    uuid primary key default uuid_generate_v4(),
  legacy_id             text,
  feature               text,
  slug                  text,
  is_available          boolean,
  description           text,
  stripe_feature_id     text,
  stripe_feature_object jsonb,
  is_deleted            boolean not null default false,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- =============================================================================
-- 5. COLLECTIONS
-- =============================================================================

create table collections (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  title       text,
  owner       uuid,                           -- FK to users (added later)
  is_active   boolean not null default true,
  is_deleted  boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- 6. USERS
-- =============================================================================

create table users (
  id                            uuid primary key default uuid_generate_v4(),
  legacy_id                     text,              -- MongoDB ObjectId
  auth_id                       uuid unique,       -- Supabase auth.users id

  -- Personal info
  full_name                     text,
  first_name                    text,
  last_name                     text,
  user_name                     text,
  email                         text,
  password                      text,              -- kept for migration, removed after Supabase Auth
  dob                           text,
  bio                           text,
  gender                        text,
  dial_code                     text,
  phone_number                  text,
  complete_phone_number         text,
  location                      jsonb default '[]'::jsonb,

  -- Google OAuth
  google_id                     text,

  -- Photos
  photo_id                      uuid references files(id),
  cover_photo_id                uuid references files(id),

  -- Interests
  interests                     uuid[] default '{}',

  -- Collections
  primary_collection            uuid references collections(id),

  -- Stripe
  is_stripe_customer            boolean not null default false,
  stripe_client_id              text,
  stripe_product_id             text,
  stripe_product                jsonb,

  -- Social links
  instagram_link                text,
  facebook_link                 text,
  tiktok_link                   text,
  youtube_link                  text,

  -- Role & mentor
  role                          user_role not null default 'user',
  is_mentor                     boolean not null default false,
  mentor_expertise              text[] default '{}',
  mentor_certifications         text[] default '{}',
  mentor_years_experience       integer,
  mentor_has_free_trial         boolean not null default false,
  mentor_rating                 numeric,
  mentor_review_count           integer not null default 0,

  -- Mentor AI settings
  mentor_ai_voice_tone          text,
  mentor_ai_kb_file_ids         uuid[] default '{}',
  mentor_ai_training_philosophy text,
  mentor_ai_nutrition_philosophy text,
  mentor_ai_macro_approach      text,
  mentor_ai_dietary_notes       text,
  core_instructions             text default '',

  -- Auth & security
  login_attempts                integer not null default 0,
  lock_until                    timestamptz,
  otp                           text,
  otp_invalid_at                timestamptz,

  -- Status flags
  is_active                     boolean not null default true,
  is_deleted                    boolean not null default false,
  deleted_at                    timestamptz,
  is_verified                   boolean not null default false,
  verified_at                   timestamptz,
  verified_by                   text,
  status                        user_status not null default 'VISITOR',

  -- Onboarding flags
  has_personal_info             boolean not null default false,
  has_photo_info                boolean not null default false,
  has_selected_interest         boolean not null default false,
  has_confirmed_age             boolean not null default false,
  has_document_uploaded         boolean not null default false,
  has_document_verified         boolean not null default false,

  -- FCM & subscription
  fcm_token                     text,
  is_free_subscription          boolean not null default false,

  -- Terms of Service
  accepted_tos_at               timestamptz,
  tos_version                   text,

  -- Profile reference
  profile_id                    uuid,              -- FK added after profiles table

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index idx_users_email on users(email);
create index idx_users_user_name on users(user_name);
create index idx_users_google_id on users(google_id);
create index idx_users_is_mentor on users(is_mentor);
create index idx_users_status on users(status);
create index idx_users_legacy_id on users(legacy_id);
create index idx_users_auth_id on users(auth_id);

-- Now add FK from interests and collections to users
alter table interests add constraint fk_interests_added_by foreign key (added_by) references users(id);
alter table collections add constraint fk_collections_owner foreign key (owner) references users(id);

-- =============================================================================
-- 7. PROFILES (detailed fitness profile)
-- =============================================================================

create table profiles (
  id                uuid primary key default uuid_generate_v4(),
  legacy_id         text,
  user_id           uuid not null references users(id) on delete cascade,
  goals             goal_type,
  experience_level  experience_level,
  body_weight_kg    numeric,
  diet              diet_type,
  schedule          jsonb,          -- {daysPerWeek, preferredDays[]}
  equipment         text[] default '{}',
  injuries          text[] default '{}',
  preferences       jsonb,          -- {hates[], likes[]}
  consent_flags     jsonb,          -- {healthData, timestamp}
  collected_percent numeric default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id)
);

-- Add FK from users to profiles
alter table users add constraint fk_users_profile foreign key (profile_id) references profiles(id);

-- =============================================================================
-- 8. USER_PROFILES (student center profile)
-- =============================================================================

create table user_profiles (
  id                        uuid primary key default uuid_generate_v4(),
  legacy_id                 text,
  user_id                   uuid not null references users(id) on delete cascade,
  goals                     text,
  current_weight_kg         numeric,
  strengths                 text,
  weaknesses                text,
  injury_history            text,
  nutrition_preferences     text,
  training_days_per_week    integer,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique(user_id)
);

-- =============================================================================
-- 9. POSTS
-- =============================================================================

create table posts (
  id                uuid primary key default uuid_generate_v4(),
  legacy_id         text,
  content           text,
  price             numeric default 0,
  orientation       text,
  tags              text[] default '{}',
  privacy           post_privacy,
  status            post_status,
  user_id           uuid not null references users(id),
  is_active         boolean not null default true,
  is_pinned         boolean not null default false,
  is_deleted        boolean not null default false,
  deleted_at        timestamptz,
  type              post_type,
  accessible_to     jsonb default '[]'::jsonb,   -- array of feature objects
  stripe_product_id text,
  stripe_product    jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_posts_user_id on posts(user_id);
create index idx_posts_status on posts(status);
create index idx_posts_created_at on posts(created_at desc);

-- Post media (embedded subdocument → separate table)
create table post_media (
  id          uuid primary key default uuid_generate_v4(),
  post_id     uuid not null references posts(id) on delete cascade,
  media_id    uuid references files(id),
  media_type  media_type,
  created_at  timestamptz not null default now()
);

create index idx_post_media_post_id on post_media(post_id);

-- Post user tags (embedded subdocument → separate table)
create table post_user_tags (
  id          uuid primary key default uuid_generate_v4(),
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references users(id),
  location_x  numeric,
  location_y  numeric
);

-- =============================================================================
-- 10. INTERACTIONS
-- =============================================================================

create table interactions (
  id            uuid primary key default uuid_generate_v4(),
  legacy_id     text,
  type          interaction_type,
  post_id       uuid references posts(id),
  user_id       uuid references users(id),           -- post owner
  interacted_by uuid references users(id),           -- who interacted
  comment       text,
  parent_id     uuid references interactions(id),    -- for replies
  is_deleted    boolean not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_interactions_post_id on interactions(post_id);
create index idx_interactions_user_id on interactions(user_id);
create index idx_interactions_interacted_by on interactions(interacted_by);
create index idx_interactions_type on interactions(type);

-- Interaction likes (self-join many-to-many)
create table interaction_likes (
  interaction_id uuid not null references interactions(id) on delete cascade,
  like_id        uuid not null references interactions(id) on delete cascade,
  primary key (interaction_id, like_id)
);

-- =============================================================================
-- 11. USER_CONNECTIONS (followers)
-- =============================================================================

create table user_connections (
  id            uuid primary key default uuid_generate_v4(),
  legacy_id     text,
  owner         uuid not null references users(id),
  following_to  uuid not null references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(owner, following_to)
);

create index idx_connections_owner on user_connections(owner);
create index idx_connections_following on user_connections(following_to);

-- =============================================================================
-- 12. CHAT_THREADS
-- =============================================================================

create table chat_threads (
  id                uuid primary key default uuid_generate_v4(),
  legacy_id         text,
  participants      uuid[] not null default '{}',
  last_message_at   timestamptz default now(),
  last_message_text text,
  unread            jsonb default '{}'::jsonb,       -- {userId: count}
  is_paused         boolean not null default false,
  safety_status     safety_status default 'green',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_chat_threads_participants on chat_threads using gin(participants);
create index idx_chat_threads_last_message on chat_threads(last_message_at desc);

-- =============================================================================
-- 13. CHAT_MESSAGES
-- =============================================================================

create table chat_messages (
  id                  uuid primary key default uuid_generate_v4(),
  legacy_id           text,
  thread_id           uuid not null references chat_threads(id) on delete cascade,
  sender              text not null,                   -- user uuid or 'assistant'
  text                text not null default '',
  flag                safety_status default 'green',
  flagged_categories  text[] default '{}',
  client_id           text,
  attachments         jsonb default '[]'::jsonb,       -- [{url, type, filename}]
  read_by             uuid[] default '{}',
  created_at          timestamptz not null default now()
);

create index idx_chat_messages_thread on chat_messages(thread_id, created_at desc);
create index idx_chat_messages_client_id on chat_messages(client_id);

-- =============================================================================
-- 14. COACH_KNOWLEDGE (with vector embedding for RAG)
-- =============================================================================

create table coach_knowledge (
  id              uuid primary key default uuid_generate_v4(),
  legacy_id       text,
  user_id         uuid not null references users(id),
  title           text not null,
  content         text not null,
  type            knowledge_type default 'text',
  mentor_name     text,
  embedding       vector(1536),                       -- OpenAI ada-002
  summary         text,
  classification  knowledge_classification default 'rag',
  keywords        text[] default '{}',
  core_rules      text[] default '{}',
  entities        text[] default '{}',
  created_at      timestamptz not null default now()
);

create index idx_coach_knowledge_user on coach_knowledge(user_id, created_at desc);
create index idx_coach_knowledge_class on coach_knowledge(user_id, classification);
create index idx_coach_knowledge_keywords on coach_knowledge using gin(keywords);

-- Vector similarity search index (IVFFlat for performance)
-- Note: Run this AFTER inserting data, or use HNSW for real-time inserts
create index idx_coach_knowledge_embedding on coach_knowledge
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- =============================================================================
-- 15. SUBSCRIPTION_PLANS
-- =============================================================================

create table subscription_plans (
  id                       uuid primary key default uuid_generate_v4(),
  legacy_id                text,
  title                    text,
  description              text,
  price                    numeric,
  duration                 integer,
  stripe_product_id        text,
  stripe_product_feature_ids text[] default '{}',
  feature_ids              uuid[] default '{}',
  stripe_product_object    jsonb,
  plan_type                plan_type,
  user_id                  uuid not null references users(id),
  permissions              jsonb default '[]'::jsonb,
  is_deleted               boolean not null default false,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- =============================================================================
-- 16. SUBSCRIPTIONS
-- =============================================================================

create table subscriptions (
  id                          uuid primary key default uuid_generate_v4(),
  legacy_id                   text,
  user_id                     uuid not null references users(id),
  plan_id                     uuid not null references subscription_plans(id),
  stripe_subscription_id      text not null,
  stripe_price_id             text not null,
  status                      subscription_status,
  start_date                  timestamptz,
  end_date                    timestamptz,
  stripe_subscription_object  text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_subscriptions_user on subscriptions(user_id);

-- =============================================================================
-- 17. TRANSACTIONS
-- =============================================================================

create table transactions (
  id                       uuid primary key default uuid_generate_v4(),
  legacy_id                text,
  user_id                  uuid not null references users(id),
  amount                   numeric,
  title                    text,
  currency                 text,
  stripe_payment_intent_id text,
  stripe_product_id        text,
  product_id               text,
  status                   transaction_status default 'PENDING',
  refund_id                text,
  refunded_at              timestamptz,
  type                     transaction_type_enum,
  product_type             product_type,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_transactions_user on transactions(user_id);

-- =============================================================================
-- 18. NOTIFICATIONS
-- =============================================================================

create table notifications (
  id                     uuid primary key default uuid_generate_v4(),
  legacy_id              text,
  title                  text not null,
  description            text not null,
  sent_to                uuid[] not null default '{}',     -- array of user IDs
  read_at                timestamptz,
  type                   text,                              -- notification type enum
  is_deleted             boolean not null default false,
  deleted_at             timestamptz,
  notification_on_post   uuid references posts(id),
  notification_from_user uuid references users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index idx_notifications_sent_to on notifications using gin(sent_to);
create index idx_notifications_created on notifications(created_at desc);

-- =============================================================================
-- 19. DOCUMENTS (identity verification)
-- =============================================================================

create table documents (
  id                uuid primary key default uuid_generate_v4(),
  legacy_id         text,
  title             text,
  description       text,
  user_id           uuid not null references users(id),
  document_media_id uuid references files(id),
  verified_at       timestamptz,
  verified_by       text,
  type              document_type,
  status            document_status default 'Pending',
  is_deleted        boolean not null default false,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =============================================================================
-- 20. CATEGORIES
-- =============================================================================

create table categories (
  id            uuid primary key default uuid_generate_v4(),
  legacy_id     text,
  module_id     uuid references modules(id),
  parent_id     uuid references categories(id),     -- self-reference
  title         text not null,
  is_active     boolean not null default false,
  activated_at  timestamptz,
  is_deleted    boolean not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =============================================================================
-- 21. CARD_DETAILS
-- =============================================================================

create table card_details (
  id                   uuid primary key default uuid_generate_v4(),
  legacy_id            text,
  user_id              uuid not null references users(id),
  stripe_card_id       text not null,
  object               text not null,
  address_city         text,
  payment_method_id    text,
  address_country      text not null,
  brand                text not null,
  country              text not null,
  cvc_check            text,
  dynamic_last4        text,
  exp_month            integer not null,
  exp_year             integer not null,
  fingerprint          text not null,
  funding              text not null,
  last4                text not null,
  is_default           boolean not null default false,
  tokenization_method  text,
  wallet               text,
  is_active            boolean not null default true,
  activated_at         timestamptz default now(),
  is_deleted           boolean not null default false,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index idx_card_details_user on card_details(user_id);

-- =============================================================================
-- 22. TIPS
-- =============================================================================

create table tips (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  message     text,
  tip_to      uuid references users(id),
  tip_by      uuid references users(id),
  tip_on      uuid references posts(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- 23. MORE_ACTIONS (reports, not interested, queries)
-- =============================================================================

create table more_actions (
  id              uuid primary key default uuid_generate_v4(),
  legacy_id       text,
  action_type     action_type,
  report_status   report_status,
  reason          report_reason,
  query           text,
  action_by_user  uuid references users(id),
  action_to_user  uuid references users(id),
  action_on_post  uuid references posts(id),
  is_deleted      boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- 24. USER_DATA (GDPR data exports)
-- =============================================================================

create table user_data (
  id              uuid primary key default uuid_generate_v4(),
  legacy_id       text,
  user_id         uuid not null references users(id),
  data            jsonb not null,
  file_format     file_format_type,
  download_before timestamptz not null,
  is_expired      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- 25. FAQS
-- =============================================================================

create table faqs (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  topics      jsonb not null,        -- [{title, content: [{title, subContent[]}]}]
  is_deleted  boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- 26. TRAINING_PLANS (student center)
-- =============================================================================

create table training_plans (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  user_id     uuid not null references users(id),
  version     integer not null,
  is_current  boolean not null default true,
  sessions    jsonb default '[]'::jsonb,     -- [{day, focus, exercises: [{name, sets, reps, load}], notes[]}]
  source_text text,
  guidelines  text[] default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_training_plans_user on training_plans(user_id, version desc);

-- =============================================================================
-- 27. NUTRITION_PLANS (student center)
-- =============================================================================

create table nutrition_plans (
  id              uuid primary key default uuid_generate_v4(),
  legacy_id       text,
  user_id         uuid not null references users(id),
  version         integer not null,
  is_current      boolean not null default true,
  daily_targets   jsonb,               -- {kcal, protein, carbs, fat}
  notes           text,
  source_text     text,
  meals           jsonb default '[]'::jsonb,       -- [{name, items[]}]
  guidelines      text[] default '{}',
  days            jsonb default '[]'::jsonb,       -- [{label, meals: [{name, items[]}]}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_nutrition_plans_user on nutrition_plans(user_id, version desc);

-- =============================================================================
-- 28. GOALS
-- =============================================================================

create table goals (
  id                       uuid primary key default uuid_generate_v4(),
  legacy_id                text,
  user_id                  uuid not null references users(id),
  version                  integer not null,
  is_current               boolean not null default true,
  target_weight_kg         numeric,
  strength_targets         text,
  horizon_weeks            integer,
  source_text              text,
  calories_daily_deficit   numeric,
  weekly_weight_loss_kg    numeric,
  weekly_exercise_minutes  numeric,
  hydration_liters         numeric,
  plan                     jsonb,         -- {shortTerm[], mediumTerm[], longTerm[], tips[]}
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_goals_user on goals(user_id, version desc);

-- =============================================================================
-- 29. WEIGHT_ENTRIES
-- =============================================================================

create table weight_entries (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  user_id     uuid not null references users(id),
  date        text not null,                -- YYYY-MM-DD
  kg          numeric not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(user_id, date)
);

create index idx_weight_entries_user_date on weight_entries(user_id, date);

-- =============================================================================
-- 30. WORKOUT_LOGS
-- =============================================================================

create table workout_logs (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  user_id     uuid not null references users(id),
  date        text not null,                -- YYYY-MM-DD
  entries     jsonb default '[]'::jsonb,    -- [{name, sets, reps, loadKg}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(user_id, date)
);

-- =============================================================================
-- 31. EXERCISE_PROGRESS
-- =============================================================================

create table exercise_progress (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  user_id     uuid not null references users(id),
  exercise    text not null,
  date        text not null,                -- YYYY-MM-DD
  value       numeric not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(user_id, exercise, date)
);

create index idx_exercise_progress on exercise_progress(user_id, exercise, date);

-- =============================================================================
-- 32. AVATARS (AI personality)
-- =============================================================================

create table avatars (
  id                          uuid primary key default uuid_generate_v4(),
  legacy_id                   text,
  user_id                     uuid not null references users(id) on delete cascade,
  personality_traits          text[] default '{}',
  current_mood                text,
  system_prompt               text,
  knowledge_base_references   uuid[] default '{}',   -- references to coach_knowledge
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique(user_id)
);

-- =============================================================================
-- 33. TRAINING_PLAN_VERSIONS
-- =============================================================================

create table training_plan_versions (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  user_id     uuid not null references users(id),
  version     integer not null,
  source      plan_source default 'action',
  reason      text,
  days        jsonb default '[]'::jsonb,     -- [{day, focus, exercises: [{name, sets, reps, rpe}]}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(user_id, version)
);

create index idx_tpv_user on training_plan_versions(user_id, version desc);

-- =============================================================================
-- 34. NUTRITION_PLAN_VERSIONS
-- =============================================================================

create table nutrition_plan_versions (
  id              uuid primary key default uuid_generate_v4(),
  legacy_id       text,
  user_id         uuid not null references users(id),
  version         integer not null,
  source          plan_source default 'action',
  reason          text,
  kcal            numeric,
  protein_grams   numeric,
  carbs_grams     numeric,
  fat_grams       numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id, version)
);

create index idx_npv_user on nutrition_plan_versions(user_id, version desc);

-- =============================================================================
-- 35. STUDENT_STATES
-- =============================================================================

create table student_states (
  id                              uuid primary key default uuid_generate_v4(),
  legacy_id                       text,
  user_id                         uuid not null references users(id) on delete cascade,
  current_training_plan_version   uuid references training_plan_versions(id),
  current_nutrition_plan_version  uuid references nutrition_plan_versions(id),
  snapshot_updated_at             timestamptz,
  last_event_at                   timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique(user_id)
);

-- =============================================================================
-- 36. STUDENT_SNAPSHOTS
-- =============================================================================

create table student_snapshots (
  id                       uuid primary key default uuid_generate_v4(),
  legacy_id                text,
  user_id                  uuid not null references users(id) on delete cascade,
  weight_series            jsonb default '[]'::jsonb,    -- [{t, v}]
  training_plan_summary    jsonb,                         -- {daysPerWeek}
  nutrition_summary         jsonb,                         -- {kcal, protein, carbs, fat}
  kpis                     jsonb,                         -- {nextWorkout, adherence7d, lastCheckIn}
  updated_at               timestamptz not null default now(),
  unique(user_id)
);

-- =============================================================================
-- 37. PLAN_PREVIEWS
-- =============================================================================

create table plan_previews (
  id              uuid primary key default uuid_generate_v4(),
  legacy_id       text,
  user_id         uuid not null references users(id) on delete cascade,
  training_week   jsonb default '[]'::jsonb,    -- [{day, focus, exercises[]}]
  nutrition       jsonb,                         -- {kcal, proteinGrams, carbsGrams, fatGrams, rationale}
  hash            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(user_id)
);

create index idx_plan_previews_hash on plan_previews(hash);

-- =============================================================================
-- 38. CHANGE_EVENTS
-- =============================================================================

create table change_events (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  user_id     uuid not null references users(id),
  type        change_event_type not null,
  summary     text not null,
  rationale   text,
  ref_id      uuid,
  actor       jsonb,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_change_events_user on change_events(user_id, created_at desc);

-- =============================================================================
-- 39. CHANGE_LOGS
-- =============================================================================

create table change_logs (
  id            uuid primary key default uuid_generate_v4(),
  legacy_id     text,
  user_id       uuid not null references users(id),
  area          text not null,                 -- 'training', 'nutrition', 'goal'
  summary       text,
  reason        text,
  from_version  integer,
  to_version    integer,
  created_at    timestamptz not null default now()
);

create index idx_change_logs_user on change_logs(user_id, created_at desc);

-- =============================================================================
-- 40. MODERATION_REPORTS
-- =============================================================================

create table moderation_reports (
  id          uuid primary key default uuid_generate_v4(),
  legacy_id   text,
  post_id     uuid not null references posts(id),
  reporter_id uuid not null references users(id),
  reason      text default '',
  status      moderation_status default 'open',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_moderation_reports on moderation_reports(post_id, reporter_id, created_at desc);

-- =============================================================================
-- 41. USER_INTERESTS (junction table for many-to-many)
-- =============================================================================

create table user_interests (
  user_id     uuid not null references users(id) on delete cascade,
  interest_id uuid not null references interests(id) on delete cascade,
  primary key (user_id, interest_id)
);

-- =============================================================================
-- HELPER: updated_at trigger function
-- =============================================================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers to all tables that have updated_at
do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.columns
    where column_name = 'updated_at'
      and table_schema = 'public'
      and table_name not in ('chat_messages')  -- messages only have created_at
  loop
    execute format(
      'create trigger trg_%s_updated_at before update on %I for each row execute function update_updated_at_column();',
      t, t
    );
  end loop;
end;
$$;

-- =============================================================================
-- ENABLE REALTIME on key tables
-- =============================================================================

alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table chat_threads;
alter publication supabase_realtime add table notifications;

-- =============================================================================
-- VECTOR SEARCH FUNCTION (for RAG)
-- =============================================================================

create or replace function match_knowledge(
  query_embedding vector(1536),
  match_user_id uuid,
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    ck.id,
    ck.title,
    ck.content,
    1 - (ck.embedding <=> query_embedding) as similarity
  from coach_knowledge ck
  where ck.user_id = match_user_id
    and ck.embedding is not null
    and 1 - (ck.embedding <=> query_embedding) > match_threshold
  order by ck.embedding <=> query_embedding
  limit match_count;
$$;

-- =============================================================================
-- DONE
-- =============================================================================
