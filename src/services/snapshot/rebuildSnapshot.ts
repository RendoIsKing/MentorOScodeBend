import { db, findOne, upsert, Tables } from "../../lib/db";

export async function rebuildSnapshot(userId: string) {
  const state = await findOne(Tables.STUDENT_STATES, { user_id: userId });

  const [tpResult, npResult] = await Promise.all([
    state?.current_training_plan_version_id
      ? db
          .from(Tables.TRAINING_PLAN_VERSIONS)
          .select("*")
          .eq("id", state.current_training_plan_version_id)
          .single()
      : { data: null },
    state?.current_nutrition_plan_version_id
      ? db
          .from(Tables.NUTRITION_PLAN_VERSIONS)
          .select("*")
          .eq("id", state.current_nutrition_plan_version_id)
          .single()
      : { data: null },
  ]);

  const tp = tpResult?.data;
  const np = npResult?.data;

  const { data: weights } = await db
    .from(Tables.WEIGHT_ENTRIES)
    .select("date, kg")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  const weightSeries = (weights || []).map((w: any) => ({
    t: w.date,
    v: w.kg,
  }));

  const daysPerWeek = tp
    ? (tp.days || []).filter((d: any) => (d.exercises || []).length).length
    : 0;

  const snap: any = {
    user_id: userId,
    weight_series: weightSeries,
    training_plan_summary: tp ? { daysPerWeek } : undefined,
    nutrition_summary: np
      ? {
          kcal: np.kcal,
          protein: np.protein_grams,
          carbs: np.carbs_grams,
          fat: np.fat_grams,
        }
      : undefined,
    kpis: { adherence7d: 0 },
  };

  await upsert(Tables.STUDENT_SNAPSHOTS, snap, "user_id");

  await upsert(
    Tables.STUDENT_STATES,
    {
      user_id: userId,
      snapshot_updated_at: new Date().toISOString(),
    },
    "user_id"
  );
}
