import { findOne, findMany, upsert, updateById, db, Tables } from "../../lib/db";

export async function onWeightLogged(userId: string, date: string, kg: number) {
  let snap = await findOne(Tables.STUDENT_SNAPSHOTS, { user_id: userId });
  if (!snap) {
    snap = await upsert(
      Tables.STUDENT_SNAPSHOTS,
      { user_id: userId, weight_series: [], kpis: {} },
      "user_id"
    );
  }

  const map = new Map((snap.weight_series || []).map((p: any) => [p.t, p.v]));
  map.set(date, kg);
  const weightSeries = Array.from(map.entries())
    .sort((ea, eb) => String(ea[0]).localeCompare(String(eb[0])))
    .map(([t, v]) => ({ t, v }));

  const kpis = {
    ...(snap.kpis || {}),
    lastCheckIn: date,
    adherence7d: snap.kpis?.adherence7d,
    nextWorkout: snap.kpis?.nextWorkout,
  };

  await updateById(Tables.STUDENT_SNAPSHOTS, snap.id, {
    weight_series: weightSeries,
    kpis,
  });
}

export async function onPlanUpdated(userId: string) {
  let snap = await findOne(Tables.STUDENT_SNAPSHOTS, { user_id: userId });
  if (!snap) {
    snap = await upsert(
      Tables.STUDENT_SNAPSHOTS,
      { user_id: userId, weight_series: [], kpis: {} },
      "user_id"
    );
  }

  const state = await findOne(Tables.STUDENT_STATES, { user_id: userId });
  const tp = state?.current_training_plan_version_id
    ? await db
        .from(Tables.TRAINING_PLAN_VERSIONS)
        .select("*")
        .eq("id", state.current_training_plan_version_id)
        .single()
        .then((r: any) => r.data)
    : null;

  const daysPerWeek = tp
    ? (tp.days || []).filter((d: any) => (d.exercises?.length ?? 0) > 0).length
    : 0;
  const todayIdx = new Date().getUTCDay();
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hasWork = (d: any) => (d.exercises?.length ?? 0) > 0;
  let nextWorkout: string | undefined;
  if (tp) {
    for (let i = 0; i < 7; i++) {
      const idx = (todayIdx + i) % 7;
      const dayName = order[idx];
      const day = (tp.days || []).find((d: any) => d.day === dayName);
      if (day && hasWork(day)) {
        nextWorkout = dayName;
        break;
      }
    }
  }

  await updateById(Tables.STUDENT_SNAPSHOTS, snap.id, {
    training_plan_summary: { daysPerWeek },
    kpis: { ...(snap.kpis || {}), nextWorkout },
  });
}

export async function onWorkoutLogged(userId: string, date: string) {
  let snap = await findOne(Tables.STUDENT_SNAPSHOTS, { user_id: userId });
  if (!snap) {
    snap = await upsert(
      Tables.STUDENT_SNAPSHOTS,
      { user_id: userId, weight_series: [], kpis: {} },
      "user_id"
    );
  }

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data: seven } = await db
    .from(Tables.WORKOUT_LOGS)
    .select("date")
    .eq("user_id", userId)
    .gte("date", since);

  const unique = new Set((seven || []).map((w: any) => w.date)).size;

  const state = await findOne(Tables.STUDENT_STATES, { user_id: userId });
  const tp = state?.current_training_plan_version_id
    ? await db
        .from(Tables.TRAINING_PLAN_VERSIONS)
        .select("*")
        .eq("id", state.current_training_plan_version_id)
        .single()
        .then((r: any) => r.data)
    : null;

  const daysPerWeek = tp
    ? (tp.days || []).filter((d: any) => (d.exercises?.length ?? 0) > 0).length
    : 0;
  const adherence7d = daysPerWeek ? Math.min(1, unique / daysPerWeek) : 0;

  await updateById(Tables.STUDENT_SNAPSHOTS, snap.id, {
    kpis: {
      ...(snap.kpis || {}),
      adherence7d,
      lastCheckIn: date,
      nextWorkout: snap.kpis?.nextWorkout,
    },
  });
}

export async function onWeightDeleted(userId: string, date: string) {
  let snap = await findOne(Tables.STUDENT_SNAPSHOTS, { user_id: userId });
  if (!snap) return;

  const weightSeries = (snap.weight_series || []).filter(
    (p: any) => p.t !== date
  );
  await updateById(Tables.STUDENT_SNAPSHOTS, snap.id, {
    weight_series: weightSeries,
  });
}
