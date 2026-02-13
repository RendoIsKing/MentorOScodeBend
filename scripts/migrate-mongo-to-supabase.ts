#!/usr/bin/env ts-node
/**
 * MongoDB → Supabase (PostgreSQL) data migration script.
 *
 * Reads all collections from MongoDB and inserts them into the corresponding
 * Supabase PostgreSQL tables. Creates a mapping of MongoDB ObjectIds → UUIDs.
 *
 * Usage:
 *   MONGO_URI=mongodb://... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx ts-node scripts/migrate-mongo-to-supabase.ts
 *
 * Flags:
 *   --dry-run     Print what would be migrated without writing
 *   --collection  Only migrate a specific collection (e.g., --collection=users)
 *   --skip-auth   Skip Supabase Auth user creation (if already done)
 */

import { connect, connection, model, Schema, Types } from "mongoose";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

// ── Config ───────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI || process.env.DB_URL || process.env.MONGODB_URI || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_AUTH = process.argv.includes("--skip-auth");
const ONLY_COLLECTION = process.argv.find((a) => a.startsWith("--collection="))?.split("=")[1];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── ObjectId → UUID mapping ──────────────────────────────────────────────────

const idMap = new Map<string, string>(); // mongoId → uuid

function mapId(mongoId: string | Types.ObjectId | null | undefined): string | null {
  if (!mongoId) return null;
  const key = String(mongoId);
  if (!idMap.has(key)) {
    idMap.set(key, uuidv4());
  }
  return idMap.get(key)!;
}

function mapIds(arr: any[] | undefined): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((id) => mapId(id)).filter(Boolean) as string[];
}

// ── Generic collection reader ────────────────────────────────────────────────

async function readCollection(name: string): Promise<any[]> {
  const col = connection.db.collection(name);
  return col.find({}).toArray();
}

// ── Batch insert helper ──────────────────────────────────────────────────────

async function batchInsert(table: string, rows: any[], batchSize = 200) {
  if (rows.length === 0) return;
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would insert ${rows.length} rows into ${table}`);
    return;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      console.error(`  [ERROR] ${table} batch ${i}: ${error.message}`);
      // Try one by one
      for (const row of batch) {
        const { error: singleError } = await supabase.from(table).upsert(row, { onConflict: "id" });
        if (singleError) {
          console.error(`  [ERROR] ${table} row ${row.id}: ${singleError.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }
  }
  console.log(`  ✓ ${table}: ${inserted}/${rows.length} rows inserted`);
}

// ── Collection migrators ─────────────────────────────────────────────────────

async function migrateUsers() {
  console.log("\n📦 Migrating users...");
  const docs = await readCollection("users");
  console.log(`  Found ${docs.length} users`);

  const rows = [];
  for (const d of docs) {
    const id = mapId(d._id)!;
    rows.push({
      id,
      legacy_id: String(d._id),
      full_name: d.fullName || null,
      first_name: d.firstName || null,
      last_name: d.lastName || null,
      user_name: d.userName || null,
      email: d.email || null,
      password: d.password || null,
      dob: d.dob || null,
      bio: d.bio || null,
      gender: d.gender || null,
      dial_code: d.dialCode || null,
      phone_number: d.phoneNumber || null,
      complete_phone_number: d.completePhoneNumber || null,
      location: d.location || [],
      google_id: d.googleId || null,
      photo_id: d.photoId ? mapId(d.photoId) : null,
      cover_photo_id: d.coverPhotoId ? mapId(d.coverPhotoId) : null,
      interests: mapIds(d.interests),
      primary_collection: d.primaryCollection ? mapId(d.primaryCollection) : null,
      is_stripe_customer: d.isStripeCustomer || false,
      stripe_client_id: d.stripeClientId || null,
      stripe_product_id: d.stripeProductId || null,
      stripe_product: d.stripeProduct || null,
      instagram_link: d.instagramLink || null,
      facebook_link: d.facebookLink || null,
      tiktok_link: d.tiktokLink || null,
      youtube_link: d.youtubeLink || null,
      role: d.role === "admin" ? "admin" : "user",
      is_mentor: d.isMentor || false,
      mentor_expertise: d.mentorExpertise || [],
      mentor_certifications: d.mentorCertifications || [],
      mentor_years_experience: d.mentorYearsExperience || null,
      mentor_has_free_trial: d.mentorHasFreeTrial || false,
      mentor_rating: d.mentorRating || null,
      mentor_review_count: d.mentorReviewCount || 0,
      mentor_ai_voice_tone: d.mentorAiVoiceTone || null,
      mentor_ai_kb_file_ids: mapIds(d.mentorAiKnowledgeBaseFileIds),
      mentor_ai_training_philosophy: d.mentorAiTrainingPhilosophy || null,
      mentor_ai_nutrition_philosophy: d.mentorAiNutritionPhilosophy || null,
      mentor_ai_macro_approach: d.mentorAiMacroApproach || null,
      mentor_ai_dietary_notes: d.mentorAiDietaryNotes || null,
      core_instructions: d.coreInstructions || "",
      login_attempts: d.loginAttempts || 0,
      lock_until: d.lockUntil || null,
      otp: d.otp || null,
      otp_invalid_at: d.otpInvalidAt || null,
      is_active: d.isActive !== false,
      is_deleted: d.isDeleted || false,
      deleted_at: d.deletedAt || null,
      is_verified: d.isVerified || false,
      verified_at: d.verifiedAt || null,
      verified_by: d.verifiedBy || null,
      status: d.status || "VISITOR",
      has_personal_info: d.hasPersonalInfo || false,
      has_photo_info: d.hasPhotoInfo || false,
      has_selected_interest: d.hasSelectedInterest || false,
      has_confirmed_age: d.hasConfirmedAge || false,
      has_document_uploaded: d.hasDocumentUploaded || false,
      has_document_verified: d.hasDocumentVerified || false,
      fcm_token: d.fcm_token || null,
      is_free_subscription: d.isFreeSubscription || false,
      accepted_tos_at: d.acceptedTosAt || null,
      tos_version: d.tosVersion || null,
      profile_id: d.profileId ? mapId(d.profileId) : null,
      created_at: d.createdAt || new Date(),
      updated_at: d.updatedAt || new Date(),
    });
  }

  await batchInsert("users", rows);

  // Create Supabase Auth users (if not skipped)
  if (!SKIP_AUTH && !DRY_RUN) {
    console.log("  Creating Supabase Auth users...");
    let authCreated = 0;
    for (const d of docs) {
      if (!d.email) continue;
      try {
        const { data, error } = await supabase.auth.admin.createUser({
          email: d.email,
          password: d.password || `temp_${uuidv4().slice(0, 8)}`, // temp password if none
          email_confirm: true,
          user_metadata: {
            first_name: d.firstName || "",
            last_name: d.lastName || "",
            full_name: d.fullName || "",
          },
        });
        if (data?.user) {
          // Link auth_id
          await supabase
            .from("users")
            .update({ auth_id: data.user.id })
            .eq("legacy_id", String(d._id));
          authCreated++;
        }
      } catch (e) {
        // User might already exist in auth
      }
    }
    console.log(`  ✓ Created ${authCreated} Supabase Auth users`);
  }
}

async function migrateFiles() {
  console.log("\n📦 Migrating files...");
  const docs = await readCollection("files");
  console.log(`  Found ${docs.length} files`);

  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    path: d.path,
    is_deleted: d.isDeleted || false,
    deleted_at: d.deletedAt || null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));

  await batchInsert("files", rows);
}

async function migrateInterests() {
  console.log("\n📦 Migrating interests...");
  const docs = await readCollection("interests");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    title: d.title,
    slug: d.slug || null,
    added_by: d.addedBy ? mapId(d.addedBy) : null,
    is_available: d.isAvailable !== false,
    is_deleted: d.isDeleted || false,
    deleted_at: d.deletedAt || null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("interests", rows);
}

async function migratePosts() {
  console.log("\n📦 Migrating posts...");
  const docs = await readCollection("posts");
  console.log(`  Found ${docs.length} posts`);

  const postRows = [];
  const mediaRows: any[] = [];
  const tagRows: any[] = [];

  for (const d of docs) {
    const postId = mapId(d._id)!;
    postRows.push({
      id: postId,
      legacy_id: String(d._id),
      content: d.content || null,
      price: d.price || 0,
      orientation: d.orientation || null,
      tags: d.tags || [],
      privacy: d.privacy || null,
      status: d.status || null,
      user_id: d.user ? mapId(d.user) : null,
      is_active: d.isActive !== false,
      is_pinned: d.isPinned || false,
      is_deleted: d.isDeleted || false,
      deleted_at: d.deletedAt || null,
      type: d.type || null,
      accessible_to: d.accessibleTo || [],
      stripe_product_id: d.stripeProductId || null,
      stripe_product: d.stripeProduct || null,
      created_at: d.createdAt || new Date(),
      updated_at: d.updatedAt || new Date(),
    });

    // Media
    if (Array.isArray(d.media)) {
      for (const m of d.media) {
        mediaRows.push({
          id: uuidv4(),
          post_id: postId,
          media_id: m.mediaId ? mapId(m.mediaId) : null,
          media_type: m.mediaType || null,
        });
      }
    }

    // User tags
    if (Array.isArray(d.userTags)) {
      for (const t of d.userTags) {
        tagRows.push({
          id: uuidv4(),
          post_id: postId,
          user_id: t.userId ? mapId(t.userId) : null,
          location_x: t.location?.x || null,
          location_y: t.location?.y || null,
        });
      }
    }
  }

  await batchInsert("posts", postRows);
  await batchInsert("post_media", mediaRows);
  await batchInsert("post_user_tags", tagRows);
}

async function migrateInteractions() {
  console.log("\n📦 Migrating interactions...");
  const docs = await readCollection("interactions");
  console.log(`  Found ${docs.length} interactions`);

  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    type: d.type || null,
    post_id: d.post ? mapId(d.post) : null,
    user_id: d.user ? mapId(d.user) : null,
    interacted_by: d.interactedBy ? mapId(d.interactedBy) : null,
    comment: d.comment || null,
    parent_id: null, // Will be set in second pass for replies
    is_deleted: d.isDeleted || false,
    deleted_at: d.deletedAt || null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));

  await batchInsert("interactions", rows);

  // Second pass: set parent_id for replies and likes
  if (!DRY_RUN) {
    for (const d of docs) {
      if (Array.isArray(d.replies) && d.replies.length > 0) {
        for (const replyId of d.replies) {
          const parentUuid = mapId(d._id);
          const childUuid = mapId(replyId);
          if (parentUuid && childUuid) {
            await supabase
              .from("interactions")
              .update({ parent_id: parentUuid })
              .eq("id", childUuid);
          }
        }
      }
      // Likes junction table
      if (Array.isArray(d.likes) && d.likes.length > 0) {
        const likeRows = d.likes
          .map((likeId: any) => ({
            interaction_id: mapId(d._id),
            like_id: mapId(likeId),
          }))
          .filter((r: any) => r.interaction_id && r.like_id);
        if (likeRows.length > 0) {
          await supabase.from("interaction_likes").upsert(likeRows, {
            onConflict: "interaction_id,like_id",
          });
        }
      }
    }
  }
}

async function migrateChatThreads() {
  console.log("\n📦 Migrating chat threads...");
  const docs = await readCollection("chatthreads");
  console.log(`  Found ${docs.length} chat threads`);

  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    participants: mapIds(d.participants),
    last_message_at: d.lastMessageAt || d.createdAt || new Date(),
    last_message_text: d.lastMessageText || null,
    unread: d.unread instanceof Map ? Object.fromEntries(d.unread) : (d.unread || {}),
    is_paused: d.isPaused || false,
    safety_status: d.safetyStatus || "green",
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));

  await batchInsert("chat_threads", rows);
}

async function migrateChatMessages() {
  console.log("\n📦 Migrating chat messages...");
  const docs = await readCollection("chatmessages");
  console.log(`  Found ${docs.length} chat messages`);

  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    thread_id: (d.thread || d.threadId) ? mapId(d.thread || d.threadId) : null,
    sender: d.sender ? (Types.ObjectId.isValid(String(d.sender)) ? mapId(d.sender) : String(d.sender)) : "unknown",
    text: d.text || "",
    flag: d.flag || "green",
    flagged_categories: d.flaggedCategories || [],
    client_id: d.clientId || null,
    attachments: d.attachments || [],
    read_by: mapIds(d.readBy),
    created_at: d.createdAt || new Date(),
  }));

  await batchInsert("chat_messages", rows);
}

async function migrateConnections() {
  console.log("\n📦 Migrating user connections...");
  const docs = await readCollection("userconnections");
  console.log(`  Found ${docs.length} connections`);

  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    owner: d.owner ? mapId(d.owner) : null,
    following_to: d.followingTo ? mapId(d.followingTo) : null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));

  await batchInsert("user_connections", rows);
}

async function migrateCoachKnowledge() {
  console.log("\n📦 Migrating coach knowledge...");
  const docs = await readCollection("coachknowledges");
  console.log(`  Found ${docs.length} knowledge entries`);

  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    user_id: d.userId ? mapId(d.userId) : null,
    title: d.title || "",
    content: d.content || "",
    type: d.type || "text",
    mentor_name: d.mentorName || null,
    embedding: d.embedding?.length === 1536 ? JSON.stringify(d.embedding) : null,
    summary: d.summary || null,
    classification: d.classification || "rag",
    keywords: d.keywords || [],
    core_rules: d.coreRules || [],
    entities: d.entities || [],
    created_at: d.createdAt || new Date(),
  }));

  await batchInsert("coach_knowledge", rows);
}

async function migrateSubscriptionPlans() {
  console.log("\n📦 Migrating subscription plans...");
  const docs = await readCollection("subscriptionplans");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    title: d.title || null,
    description: d.description || null,
    price: d.price || null,
    duration: d.duration || null,
    stripe_product_id: d.stripeProductId || null,
    stripe_product_feature_ids: d.stripeProductFeatureIds || [],
    feature_ids: mapIds(d.featureIds),
    stripe_product_object: d.stripeProductObject || null,
    plan_type: d.planType || null,
    user_id: d.userId ? mapId(d.userId) : null,
    permissions: d.permissions || [],
    is_deleted: d.isDeleted || false,
    deleted_at: d.deletedAt || null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("subscription_plans", rows);
}

async function migrateSubscriptions() {
  console.log("\n📦 Migrating subscriptions...");
  const docs = await readCollection("subscriptions");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    user_id: d.userId ? mapId(d.userId) : null,
    plan_id: d.planId ? mapId(d.planId) : null,
    stripe_subscription_id: d.StripeSubscriptionId || "",
    stripe_price_id: d.StripePriceId || "",
    status: d.status || null,
    start_date: d.startDate || null,
    end_date: d.endDate || null,
    stripe_subscription_object: d.stripeSubscriptionObject || null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("subscriptions", rows);
}

async function migrateTransactions() {
  console.log("\n📦 Migrating transactions...");
  const docs = await readCollection("transactions");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    user_id: d.userId ? mapId(d.userId) : null,
    amount: d.amount || null,
    title: d.title || null,
    currency: d.currency || null,
    stripe_payment_intent_id: d.stripePaymentIntentId || null,
    stripe_product_id: d.stripeProductId || null,
    product_id: d.productId || null,
    status: d.status || "PENDING",
    refund_id: d.refundId || null,
    refunded_at: d.refundedAt || null,
    type: d.type || null,
    product_type: d.productType || null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("transactions", rows);
}

async function migrateNotifications() {
  console.log("\n📦 Migrating notifications...");
  const docs = await readCollection("notifications");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    title: d.title || "",
    description: d.description || "",
    sent_to: mapIds(d.sentTo),
    read_at: d.readAt || null,
    type: d.type || null,
    is_deleted: d.isDeleted || false,
    deleted_at: d.deletedAt || null,
    notification_on_post: d.notificationOnPost ? mapId(d.notificationOnPost) : null,
    notification_from_user: d.notificationFromUser ? mapId(d.notificationFromUser) : null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("notifications", rows);
}

async function migrateTrainingPlans() {
  console.log("\n📦 Migrating training plans...");
  const docs = await readCollection("trainingplans");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    user_id: d.userId ? mapId(d.userId) : null,
    version: d.version || 1,
    is_current: d.isCurrent !== false,
    sessions: d.sessions || [],
    source_text: d.sourceText || null,
    guidelines: d.guidelines || [],
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("training_plans", rows);
}

async function migrateNutritionPlans() {
  console.log("\n📦 Migrating nutrition plans...");
  const docs = await readCollection("nutritionplans");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    user_id: d.userId ? mapId(d.userId) : null,
    version: d.version || 1,
    is_current: d.isCurrent !== false,
    daily_targets: d.dailyTargets || null,
    notes: d.notes || null,
    source_text: d.sourceText || null,
    meals: d.meals || [],
    guidelines: d.guidelines || [],
    days: d.days || [],
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("nutrition_plans", rows);
}

async function migrateGoals() {
  console.log("\n📦 Migrating goals...");
  const docs = await readCollection("goals");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    user_id: d.userId ? mapId(d.userId) : null,
    version: d.version || 1,
    is_current: d.isCurrent !== false,
    target_weight_kg: d.targetWeightKg || null,
    strength_targets: d.strengthTargets || null,
    horizon_weeks: d.horizonWeeks || null,
    source_text: d.sourceText || null,
    calories_daily_deficit: d.caloriesDailyDeficit || null,
    weekly_weight_loss_kg: d.weeklyWeightLossKg || null,
    weekly_exercise_minutes: d.weeklyExerciseMinutes || null,
    hydration_liters: d.hydrationLiters || null,
    plan: d.plan || null,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("goals", rows);
}

async function migrateWeightEntries() {
  console.log("\n📦 Migrating weight entries...");
  const docs = await readCollection("weightentries");
  const rows = docs.map((d: any) => ({
    id: mapId(d._id)!,
    legacy_id: String(d._id),
    user_id: d.userId ? mapId(d.userId) : null,
    date: d.date || "",
    kg: d.kg || 0,
    created_at: d.createdAt || new Date(),
    updated_at: d.updatedAt || new Date(),
  }));
  await batchInsert("weight_entries", rows);
}

async function migrateRemainingCollections() {
  // Workout logs
  const workoutLogs = await readCollection("workoutlogs");
  if (workoutLogs.length > 0) {
    console.log("\n📦 Migrating workout logs...");
    const rows = workoutLogs.map((d: any) => ({
      id: mapId(d._id)!, legacy_id: String(d._id),
      user_id: d.user ? mapId(d.user) : null,
      date: d.date || "", entries: d.entries || [],
      created_at: d.createdAt || new Date(), updated_at: d.updatedAt || new Date(),
    }));
    await batchInsert("workout_logs", rows);
  }

  // Exercise progress
  const exerciseProgress = await readCollection("exerciseprogresses");
  if (exerciseProgress.length > 0) {
    console.log("\n📦 Migrating exercise progress...");
    const rows = exerciseProgress.map((d: any) => ({
      id: mapId(d._id)!, legacy_id: String(d._id),
      user_id: d.userId ? mapId(d.userId) : null,
      exercise: d.exercise || "", date: d.date || "", value: d.value || 0,
      created_at: d.createdAt || new Date(), updated_at: d.updatedAt || new Date(),
    }));
    await batchInsert("exercise_progress", rows);
  }

  // Change events
  const changeEvents = await readCollection("changeevents");
  if (changeEvents.length > 0) {
    console.log("\n📦 Migrating change events...");
    const rows = changeEvents.map((d: any) => ({
      id: mapId(d._id)!, legacy_id: String(d._id),
      user_id: d.user ? mapId(d.user) : null,
      type: d.type || "PLAN_EDIT", summary: d.summary || "",
      rationale: d.rationale || null,
      ref_id: d.refId ? mapId(d.refId) : null,
      actor: d.actor || null, before_data: d.before || null, after_data: d.after || null,
      created_at: d.createdAt || new Date(), updated_at: d.updatedAt || new Date(),
    }));
    await batchInsert("change_events", rows);
  }

  // Change logs
  const changeLogs = await readCollection("changelogs");
  if (changeLogs.length > 0) {
    console.log("\n📦 Migrating change logs...");
    const rows = changeLogs.map((d: any) => ({
      id: mapId(d._id)!, legacy_id: String(d._id),
      user_id: (d.userId || d.user) ? mapId(d.userId || d.user) : null,
      area: d.area || d.type || "training",
      summary: d.summary || "", reason: d.reason || d.rationale || null,
      from_version: d.fromVersion || null, to_version: d.toVersion || null,
      created_at: d.createdAt || new Date(),
    }));
    await batchInsert("change_logs", rows);
  }

  // Student snapshots
  const snapshots = await readCollection("studentsnapshots");
  if (snapshots.length > 0) {
    console.log("\n📦 Migrating student snapshots...");
    const rows = snapshots.map((d: any) => ({
      id: mapId(d._id)!, legacy_id: String(d._id),
      user_id: d.user ? mapId(d.user) : null,
      weight_series: d.weightSeries || [],
      training_plan_summary: d.trainingPlanSummary || null,
      nutrition_summary: d.nutritionSummary || null,
      kpis: d.kpis || null,
      updated_at: d.updatedAt || new Date(),
    }));
    await batchInsert("student_snapshots", rows);
  }

  // Student states
  const states = await readCollection("studentstates");
  if (states.length > 0) {
    console.log("\n📦 Migrating student states...");
    const rows = states.map((d: any) => ({
      id: mapId(d._id)!, legacy_id: String(d._id),
      user_id: d.user ? mapId(d.user) : null,
      current_training_plan_version: d.currentTrainingPlanVersion ? mapId(d.currentTrainingPlanVersion) : null,
      current_nutrition_plan_version: d.currentNutritionPlanVersion ? mapId(d.currentNutritionPlanVersion) : null,
      snapshot_updated_at: d.snapshotUpdatedAt || null,
      last_event_at: d.lastEventAt || null,
      created_at: d.createdAt || new Date(), updated_at: d.updatedAt || new Date(),
    }));
    await batchInsert("student_states", rows);
  }

  // Profiles
  const profiles = await readCollection("profiles");
  if (profiles.length > 0) {
    console.log("\n📦 Migrating profiles...");
    const rows = profiles.map((d: any) => ({
      id: mapId(d._id)!, legacy_id: String(d._id),
      user_id: d.user ? mapId(d.user) : null,
      goals: d.goals || null, experience_level: d.experienceLevel || null,
      body_weight_kg: d.bodyWeightKg || null, diet: d.diet || null,
      schedule: d.schedule || null, equipment: d.equipment || [],
      injuries: d.injuries || [], preferences: d.preferences || null,
      consent_flags: d.consentFlags || null,
      collected_percent: d.collectedPercent || 0,
      created_at: d.createdAt || new Date(), updated_at: d.updatedAt || new Date(),
    }));
    await batchInsert("profiles", rows);
  }

  // Remaining small collections
  for (const [colName, tableName] of [
    ["modules", "modules"],
    ["features", "features"],
    ["collections", "collections"],
    ["categories", "categories"],
    ["documents", "documents"],
    ["carddetails", "card_details"],
    ["tips", "tips"],
    ["moreactions", "more_actions"],
    ["faqs", "faqs"],
    ["moderationreports", "moderation_reports"],
    ["avatars", "avatars"],
    ["planpreviews", "plan_previews"],
  ] as [string, string][]) {
    try {
      const docs = await readCollection(colName);
      if (docs.length === 0) continue;
      console.log(`\n📦 Migrating ${colName} → ${tableName} (${docs.length} docs)...`);
      // Generic migration - map _id to id and keep all fields
      const rows = docs.map((d: any) => {
        const row: any = { id: mapId(d._id)!, legacy_id: String(d._id) };
        // Copy remaining fields with basic snake_case conversion
        for (const [k, v] of Object.entries(d)) {
          if (k === "_id" || k === "__v") continue;
          const snakeKey = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
          // Map ObjectId refs
          if (v instanceof Types.ObjectId) {
            row[snakeKey] = mapId(v);
          } else {
            row[snakeKey] = v;
          }
        }
        return row;
      });
      await batchInsert(tableName, rows);
    } catch (e) {
      console.log(`  ⚠ Skipped ${colName}: ${(e as any).message}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MongoDB → Supabase Data Migration");
  console.log("═══════════════════════════════════════════════════════════");
  if (DRY_RUN) console.log("  ⚠ DRY RUN MODE — no data will be written\n");

  if (!MONGO_URI) {
    console.error("❌ MONGO_URI not set. Provide a MongoDB connection string.");
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  // Connect to MongoDB
  console.log("Connecting to MongoDB...");
  await connect(MONGO_URI);
  console.log("✓ Connected to MongoDB\n");

  // Migration order matters (foreign key dependencies)
  const migrations: [string, () => Promise<void>][] = [
    ["files", migrateFiles],
    ["interests", migrateInterests],
    ["users", migrateUsers],
    ["posts", migratePosts],
    ["interactions", migrateInteractions],
    ["connections", migrateConnections],
    ["chat_threads", migrateChatThreads],
    ["chat_messages", migrateChatMessages],
    ["coach_knowledge", migrateCoachKnowledge],
    ["subscription_plans", migrateSubscriptionPlans],
    ["subscriptions", migrateSubscriptions],
    ["transactions", migrateTransactions],
    ["notifications", migrateNotifications],
    ["training_plans", migrateTrainingPlans],
    ["nutrition_plans", migrateNutritionPlans],
    ["goals", migrateGoals],
    ["weight_entries", migrateWeightEntries],
    ["remaining", migrateRemainingCollections],
  ];

  for (const [name, migrateFn] of migrations) {
    if (ONLY_COLLECTION && name !== ONLY_COLLECTION) continue;
    try {
      await migrateFn();
    } catch (err) {
      console.error(`\n❌ Error migrating ${name}:`, (err as any).message);
    }
  }

  // Save ID mapping for reference
  if (!DRY_RUN) {
    console.log("\n📝 Saving ID mapping...");
    const mappingRows = Array.from(idMap.entries()).map(([mongoId, uuid]) => ({
      mongo_id: mongoId,
      uuid,
    }));
    // Create mapping table if needed
    try {
      await supabase.rpc("exec_sql", {
        sql: `create table if not exists _id_mapping (
          mongo_id text primary key,
          uuid uuid not null
        )`,
      });
      await batchInsert("_id_mapping", mappingRows);
    } catch {
      console.log("  ⚠ Could not save ID mapping table (non-fatal)");
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Migration complete! ${idMap.size} IDs mapped.`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  await connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
