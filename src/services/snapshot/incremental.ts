import StudentSnapshot from "../../models/StudentSnapshot";
import StudentState from "../../models/StudentState";
import TrainingPlanVersion from "../../models/TrainingPlanVersion";
import WorkoutLog from "../../models/WorkoutLog";
import { Types } from "mongoose";

function movingAvg(series: { t: string; v: number }[], window = 7) {
  if (!series.length) return { latestAvg: null as number|null, prevAvg: null as number|null, delta: null as number|null };
  const parse = (d: string) => new Date(d + "T00:00:00Z").getTime();
  const sorted = [...series].sort((a, b) => parse(a.t) - parse(b.t));
  const recent = sorted.slice(-window);
  const prev = sorted.slice(-window*2, -window);
  const sum = (arr: any[]) => arr.reduce((s, x) => s + x.v, 0);
  const latestAvg = recent.length ? sum(recent) / recent.length : null;
  const prevAvg = prev.length ? sum(prev) / prev.length : null;
  const delta = latestAvg != null && prevAvg != null ? latestAvg - prevAvg : null;
  return { latestAvg, prevAvg, delta };
}

export async function onWeightLogged(user: Types.ObjectId, date: string, kg: number) {
  const snap = (await StudentSnapshot.findOne({ user })) || new (StudentSnapshot as any)({ user, weightSeries: [] });
  const map = new Map((snap.weightSeries || []).map((p: any) => [p.t, p.v]));
  map.set(date, kg);
  snap.weightSeries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => ({ t, v }));
  const trend = movingAvg(snap.weightSeries, 7);
  snap.kpis = { ...(snap.kpis || {}), lastCheckIn: date, adherence7d: snap.kpis?.adherence7d, nextWorkout: snap.kpis?.nextWorkout } as any;
  await snap.save();
}

export async function onPlanUpdated(user: Types.ObjectId) {
  const snap = (await StudentSnapshot.findOne({ user })) || new (StudentSnapshot as any)({ user, weightSeries: [] });
  const state = await StudentState.findOne({ user });
  const tp = state?.currentTrainingPlanVersion ? await TrainingPlanVersion.findById(state.currentTrainingPlanVersion) : null;
  const daysPerWeek = tp ? (tp.days || []).filter((d: any) => (d.exercises?.length ?? 0) > 0).length : 0;
  const todayIdx = new Date().getUTCDay();
  const order = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const hasWork = (d: any) => (d.exercises?.length ?? 0) > 0;
  let nextWorkout: string | undefined;
  if (tp) {
    for (let i = 0; i < 7; i++) {
      const idx = (todayIdx + i) % 7;
      const dayName = order[idx];
      const day = (tp.days || []).find((d: any) => d.day === dayName);
      if (day && hasWork(day)) { nextWorkout = dayName; break; }
    }
  }
  snap.trainingPlanSummary = { daysPerWeek } as any;
  snap.kpis = { ...(snap.kpis || {}), nextWorkout } as any;
  await snap.save();
}

export async function onWorkoutLogged(user: Types.ObjectId, date: string) {
  const snap = (await StudentSnapshot.findOne({ user })) || new (StudentSnapshot as any)({ user, weightSeries: [] });
  const since = new Date(Date.now() - 7*24*3600*1000);
  const seven = await WorkoutLog.find({ user, date: { $gte: since.toISOString().slice(0,10) } });
  const unique = new Set(seven.map((w: any) => w.date)).size;
  const state = await StudentState.findOne({ user });
  const tp = state?.currentTrainingPlanVersion ? await TrainingPlanVersion.findById(state.currentTrainingPlanVersion) : null;
  const daysPerWeek = tp ? (tp.days || []).filter((d: any) => (d.exercises?.length ?? 0) > 0).length : 0;
  const adherence7d = daysPerWeek ? Math.min(1, unique / daysPerWeek) : 0;
  snap.kpis = { ...(snap.kpis || {}), adherence7d, lastCheckIn: date, nextWorkout: (snap.kpis as any)?.nextWorkout } as any;
  await snap.save();
}


