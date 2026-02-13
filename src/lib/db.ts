/**
 * Database utility layer — wraps Supabase client for common query patterns.
 *
 * This replaces Mongoose model methods like findById, findOne, find, etc.
 * All controllers should import from here instead of using Mongoose directly.
 */
import { supabaseAdmin } from "./supabase";
// Supabase client types available via supabaseAdmin

export { supabaseAdmin };

// Re-export the admin client as 'db' for convenience
export const db = supabaseAdmin;

// ── Table name constants ─────────────────────────────────────────────────────
export const Tables = {
  USERS: "users",
  FILES: "files",
  INTERESTS: "interests",
  USER_INTERESTS: "user_interests",
  PROFILES: "profiles",
  USER_PROFILES: "user_profiles",
  POSTS: "posts",
  POST_MEDIA: "post_media",
  POST_USER_TAGS: "post_user_tags",
  INTERACTIONS: "interactions",
  INTERACTION_LIKES: "interaction_likes",
  USER_CONNECTIONS: "user_connections",
  CHAT_THREADS: "chat_threads",
  CHAT_MESSAGES: "chat_messages",
  COACH_KNOWLEDGE: "coach_knowledge",
  SUBSCRIPTION_PLANS: "subscription_plans",
  SUBSCRIPTIONS: "subscriptions",
  TRANSACTIONS: "transactions",
  NOTIFICATIONS: "notifications",
  DOCUMENTS: "documents",
  CATEGORIES: "categories",
  MODULES: "modules",
  CARD_DETAILS: "card_details",
  TIPS: "tips",
  MORE_ACTIONS: "more_actions",
  USER_DATA: "user_data",
  FAQS: "faqs",
  TRAINING_PLANS: "training_plans",
  NUTRITION_PLANS: "nutrition_plans",
  GOALS: "goals",
  WEIGHT_ENTRIES: "weight_entries",
  WORKOUT_LOGS: "workout_logs",
  EXERCISE_PROGRESS: "exercise_progress",
  AVATARS: "avatars",
  TRAINING_PLAN_VERSIONS: "training_plan_versions",
  NUTRITION_PLAN_VERSIONS: "nutrition_plan_versions",
  STUDENT_STATES: "student_states",
  STUDENT_SNAPSHOTS: "student_snapshots",
  PLAN_PREVIEWS: "plan_previews",
  CHANGE_EVENTS: "change_events",
  CHANGE_LOGS: "change_logs",
  MODERATION_REPORTS: "moderation_reports",
  COLLECTIONS: "collections",
  FEATURES: "features",
} as const;

// ── Common query helpers ─────────────────────────────────────────────────────

/**
 * Find a single row by ID.
 * Replaces: Model.findById(id)
 */
export async function findById<T = any>(
  table: string,
  id: string,
  select = "*",
): Promise<T | null> {
  const { data, error } = await db
    .from(table)
    .select(select)
    .eq("id", id)
    .single();
  if (error) return null;
  return data as T;
}

/**
 * Find a single row matching filters.
 * Replaces: Model.findOne({ field: value })
 */
export async function findOne<T = any>(
  table: string,
  filters: Record<string, any>,
  select = "*",
): Promise<T | null> {
  let query = db.from(table).select(select);
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return null;
  return data as T;
}

/**
 * Find multiple rows matching filters.
 * Replaces: Model.find({ field: value })
 */
export async function findMany<T = any>(
  table: string,
  filters: Record<string, any> = {},
  options: {
    select?: string;
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<T[]> {
  let query = db.from(table).select(options.select || "*");
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      query = query.in(key, value);
    } else {
      query = query.eq(key, value);
    }
  }
  if (options.orderBy) {
    query = query.order(options.orderBy, {
      ascending: options.ascending ?? false,
    });
  }
  if (options.limit) query = query.limit(options.limit);
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  const { data, error } = await query;
  if (error) return [];
  return (data || []) as T[];
}

/**
 * Insert a single row.
 * Replaces: Model.create(data)
 */
export async function insertOne<T = any>(
  table: string,
  row: Record<string, any>,
  select = "*",
): Promise<T | null> {
  const { data, error } = await db
    .from(table)
    .insert(row)
    .select(select)
    .single();
  if (error) {
    console.error(`[db:insertOne] ${table}:`, error.message);
    return null;
  }
  return data as T;
}

/**
 * Insert multiple rows.
 * Replaces: Model.insertMany(docs)
 */
export async function insertMany<T = any>(
  table: string,
  rows: Record<string, any>[],
  select = "*",
): Promise<T[]> {
  const { data, error } = await db.from(table).insert(rows).select(select);
  if (error) {
    console.error(`[db:insertMany] ${table}:`, error.message);
    return [];
  }
  return (data || []) as T[];
}

/**
 * Update a single row by ID.
 * Replaces: Model.findByIdAndUpdate(id, data, { new: true })
 */
export async function updateById<T = any>(
  table: string,
  id: string,
  updates: Record<string, any>,
  select = "*",
): Promise<T | null> {
  const { data, error } = await db
    .from(table)
    .update(updates)
    .eq("id", id)
    .select(select)
    .single();
  if (error) {
    console.error(`[db:updateById] ${table}:`, error.message);
    return null;
  }
  return data as T;
}

/**
 * Update rows matching filters.
 * Replaces: Model.updateMany(filter, data)
 */
export async function updateMany(
  table: string,
  filters: Record<string, any>,
  updates: Record<string, any>,
): Promise<number> {
  let query = db.from(table).update(updates);
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { error, count } = await query;
  if (error) {
    console.error(`[db:updateMany] ${table}:`, error.message);
    return 0;
  }
  return count || 0;
}

/**
 * Soft-delete a row by ID (sets is_deleted = true).
 * Replaces: Model.findByIdAndUpdate(id, { isDeleted: true })
 */
export async function softDelete(table: string, id: string): Promise<boolean> {
  const { error } = await db
    .from(table)
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

/**
 * Hard-delete a row by ID.
 * Replaces: Model.findByIdAndDelete(id)
 */
export async function deleteById(table: string, id: string): Promise<boolean> {
  const { error } = await db.from(table).delete().eq("id", id);
  return !error;
}

/**
 * Count rows matching filters.
 * Replaces: Model.countDocuments(filter)
 */
export async function count(
  table: string,
  filters: Record<string, any> = {},
): Promise<number> {
  let query = db
    .from(table)
    .select("id", { count: "exact", head: true });
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { count: n } = await query;
  return n || 0;
}

/**
 * Upsert a row (insert or update on conflict).
 * Replaces: Model.findOneAndUpdate(filter, data, { upsert: true, new: true })
 */
export async function upsert<T = any>(
  table: string,
  row: Record<string, any>,
  onConflict: string,
  select = "*",
): Promise<T | null> {
  const { data, error } = await db
    .from(table)
    .upsert(row, { onConflict })
    .select(select)
    .single();
  if (error) {
    console.error(`[db:upsert] ${table}:`, error.message);
    return null;
  }
  return data as T;
}

/**
 * Paginated find with total count.
 */
export async function paginate<T = any>(
  table: string,
  filters: Record<string, any> = {},
  options: {
    select?: string;
    orderBy?: string;
    ascending?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ data: T[]; total: number; page: number; pageSize: number }> {
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const offset = (page - 1) * pageSize;

  let countQuery = db
    .from(table)
    .select("id", { count: "exact", head: true });
  let dataQuery = db.from(table).select(options.select || "*");

  for (const [key, value] of Object.entries(filters)) {
    countQuery = countQuery.eq(key, value);
    dataQuery = dataQuery.eq(key, value);
  }

  if (options.orderBy) {
    dataQuery = dataQuery.order(options.orderBy, {
      ascending: options.ascending ?? false,
    });
  }

  dataQuery = dataQuery.range(offset, offset + pageSize - 1);

  const [{ count: total }, { data }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  return {
    data: (data || []) as T[],
    total: total || 0,
    page,
    pageSize,
  };
}

/**
 * Call a Supabase RPC function.
 * Replaces: Mongoose aggregation pipelines via PostgreSQL functions.
 */
export async function rpc<T = any>(
  fn: string,
  params: Record<string, any> = {},
): Promise<T | null> {
  const { data, error } = await db.rpc(fn, params);
  if (error) {
    console.error(`[db:rpc] ${fn}:`, error.message);
    return null;
  }
  return data as T;
}

// ── Field mapping helpers ────────────────────────────────────────────────────

/**
 * Convert camelCase field names to snake_case for database queries.
 */
export function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

/**
 * Convert snake_case field names to camelCase for API responses.
 */
export function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}
