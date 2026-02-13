import { db, Tables } from "../../lib/db";

export async function nextTrainingVersion(userId: string): Promise<number> {
  const { data: last } = await db
    .from(Tables.TRAINING_PLAN_VERSIONS)
    .select("version")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last?.version ?? 0) + 1;
}

export async function nextNutritionVersion(userId: string): Promise<number> {
  const { data: last } = await db
    .from(Tables.NUTRITION_PLAN_VERSIONS)
    .select("version")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last?.version ?? 0) + 1;
}
