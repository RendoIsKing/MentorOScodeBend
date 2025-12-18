# Migrasjonsgrunnlag: Supabase (PostgreSQL)

## DEL 1: SQL Database Schema (Supabase)

```sql
-- Enum types
CREATE TYPE privacy AS ENUM ('public','private','friends','followers','subscriber','pay-per-view');
CREATE TYPE post_status AS ENUM ('draft','published','unpublished','restricted','flagged');
CREATE TYPE post_type AS ENUM ('post','story');
CREATE TYPE media_type AS ENUM ('image','video','live','story');
CREATE TYPE interaction_type AS ENUM ('like_post','like_story','comment','like_comment','collection_saved','impression','view');
CREATE TYPE subscription_status AS ENUM ('inactive','active','paused','cancelled');

-- Core tables
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  user_name TEXT,
  password TEXT DEFAULT NULL,
  dob TEXT,
  bio TEXT,
  gender TEXT,
  email TEXT,
  google_id TEXT,
  has_personal_info BOOLEAN DEFAULT FALSE,
  has_photo_info BOOLEAN DEFAULT FALSE,
  has_selected_interest BOOLEAN DEFAULT FALSE,
  has_confirmed_age BOOLEAN DEFAULT FALSE,
  has_document_uploaded BOOLEAN DEFAULT FALSE,
  has_document_verified BOOLEAN DEFAULT FALSE,
  location JSONB DEFAULT '[]'::jsonb,
  dial_code TEXT,
  phone_number TEXT,
  photo_id UUID REFERENCES files(id),
  cover_photo_id UUID REFERENCES files(id),
  interests UUID[] REFERENCES interests(id)[],
  primary_collection UUID REFERENCES collections(id),
  is_stripe_customer BOOLEAN DEFAULT FALSE,
  stripe_client_id TEXT,
  instagram_link TEXT,
  facebook_link TEXT,
  tiktok_link TEXT,
  youtube_link TEXT,
  stripe_product_id TEXT,
  stripe_product JSONB,
  role TEXT DEFAULT 'USER',
  is_mentor BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  fcm_token TEXT,
  complete_phone_number TEXT,
  otp TEXT,
  is_free_subscription BOOLEAN DEFAULT FALSE,
  otp_invalid_at TIMESTAMPTZ,
  status TEXT DEFAULT 'VISITOR',
  accepted_tos_at TIMESTAMPTZ,
  tos_version TEXT,
  profile_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_is_mentor ON users(is_mentor);

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  height NUMERIC,
  weight NUMERIC,
  chest NUMERIC,
  waist NUMERIC,
  age INTEGER,
  activity TEXT,
  goals TEXT[],
  body_fat_percentage NUMERIC,
  medical_conditions TEXT,
  equipment TEXT[],
  activity_levels TEXT[],
  allergies TEXT[],
  preferences TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_user_profiles_user_id ON user_profiles(user_id);

CREATE TABLE training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  version INTEGER NOT NULL,
  is_current BOOLEAN DEFAULT TRUE,
  sessions JSONB NOT NULL,
  source_text TEXT,
  guidelines TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, version)
);
CREATE INDEX idx_training_plan_user_version ON training_plans(user_id, version DESC);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media JSONB,
  content TEXT,
  price NUMERIC DEFAULT 0,
  orientation TEXT,
  tags TEXT[],
  privacy privacy,
  status post_status,
  user_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  type post_type,
  accessible_to JSONB DEFAULT '[]'::jsonb,
  user_tags JSONB DEFAULT '[]'::jsonb,
  stripe_product_id TEXT,
  stripe_product JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_status_privacy ON posts(status, privacy);

CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type interaction_type,
  post_id UUID REFERENCES posts(id),
  user_id UUID REFERENCES users(id),
  replies UUID[] REFERENCES interactions(id)[],
  likes UUID[] REFERENCES interactions(id)[],
  interacted_by UUID REFERENCES users(id),
  comment TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_interactions_post_type_user ON interactions(post_id, type, user_id);

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC,
  currency TEXT,
  permissions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_subscription_plans_user_id ON subscription_plans(user_id);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  plan_id UUID REFERENCES subscription_plans(id) NOT NULL,
  stripe_subscription_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,
  status subscription_status,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  stripe_subscription_object TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_subscriptions_user_plan ON subscriptions(user_id, plan_id);

-- Additional domain tables (abridged for clarity)
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT,
  key TEXT,
  file_format TEXT,
  media_type media_type,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  user_id UUID REFERENCES users(id),
  posts UUID[] REFERENCES posts(id)[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT,
  target_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE nutrition_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  version INTEGER NOT NULL,
  is_current BOOLEAN DEFAULT TRUE,
  meals JSONB,
  guidelines TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  weight NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  sent_to UUID[] REFERENCES users(id)[],
  type TEXT,
  notification_on_post UUID REFERENCES posts(id),
  notification_from_user UUID REFERENCES users(id),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

> Merk: Felter som var dynamiske/ukjente i MongoDB (f.eks. fleksible objekter) er representert som `JSONB` for å bevare strukturen i Supabase.

## DEL 2: API & Forretningsregler

### PostsController (createPost)
- Validerer inn-data via `CreatePostDto` og returnerer 400 med alle valideringsfeil før videre prosessering.
- Verifiserer at taggede brukere finnes og ikke er slettet; avviser forespørselen hvis noen er ugyldige.
- Hvis `planToAccess` er satt, hentes eierens `SubscriptionPlan`; mapper planens `permissions` til `accessibleTo`-feltet i posten.
- Ved `privacy = PAY_PER_VIEW` opprettes Stripe-produkt og pris for pay-per-view og lagres på posten (inkl. `stripeProductId`).
- Oppretter posten med kobling til innlogget bruker, lagrer tilgjengelighetsfunksjoner og returnerer `postId` og postdata.

### InteractionController (toggleLikeAction)
- Leser postId fra URL, verifiserer at posten finnes og ikke er slettet.
- Søker etter eksisterende like-interaksjon mellom innlogget bruker og posten; hvis funnet, slettes den (toggle «dislike»).
- Hvis ikke funnet, opprettes `Interaction` av typen `LIKE_POST` med referanse til postens eier og den interagerende brukeren.
- Forsøker å sende push-varsel til postens eier (FCM) med tittel/tekst og lagrer varsel i databasen; ignorerer hvis bruker eller token mangler.
- Returnerer respons med enten «Post disliked» eller det opprettede like-objektet.

### Interaction Decision Engine (decisionEngine.ts)
- Henter brukerens nåværende training- og nutrition-planer; beregner neste `version` basert på siste plan.
- Deaktiverer eksisterende «current» planer (`isCurrent=false`) før nye lagres.
- Oppretter nye `TrainingPlan`- eller `NutritionPlan`-dokumenter med genererte `sessions` basert på beslutningslogikk (f.eks. goals eller milestones i filen).
- Returnerer nye plan-objekter for klientoppdatering.

### Interaction GenerateFirstPlans (generateFirstPlans.ts)
- Oppretter initiale training- og nutrition-planer for en bruker hvis ingen versjon finnes.
- Setter `isCurrent=true` for nyeste planer og `version=1` (eller neste versjon etter eksisterende maks) når de genereres.
- Logger opprettelse i `ChangeLog` for sporbarhet av første planversjon.

### Post Queries
- `getAllPostsActions`: paginerer/filtrerer poster (inkl. status/privat-moduser) og returnerer med brukerdata.
- `getPostById`: henter enkeltpost med populering av referanser og håndterer 404 hvis ikke funnet.
- `getPostsOfUserByUserName` og story-varianter: slår opp bruker på brukernavn og henter poster/stories for vedkommende.
- `getTaggedUsers`: returnerer brukere som er tagget i en gitt post.

### Comment & Reaction Actions
- `commentPost.action`: oppretter `Interaction` av typen `COMMENT` bundet til post og bruker; kan trigge notifikasjon.
- `nestedCommentAction`: tillater svar på eksisterende kommentar via `replies`-feltet og oppdaterer hierarkiet.
- `likeACommentAction`: toggler `LIKE_COMMENT` på kommentarnivå og vedlikeholder `likes`-listen.
- `deleteCommentAction`: markerer kommentar som slettet eller fjerner den fra lagrede referanser.
- `savePostAction`: oppretter `COLLECTION_SAVED`-interaksjoner og legger posten i brukerens kolleksjon.
- `createImpressionAction` og `logViewAction`: registrerer `IMPRESSION`/`VIEW` interaksjoner for analytics/visninger.
```
