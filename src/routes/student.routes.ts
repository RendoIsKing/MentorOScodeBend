import { Router, Request, Response } from "express";
import { z } from 'zod';
import { Auth as ensureAuth, validateZod } from '../app/Middlewares';
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';
import { db, findOne, findMany, insertOne, upsert, Tables } from "../lib/db";
import { publish } from "../services/events/publish";
import jwt from 'jsonwebtoken';

const StudentRoutes: Router = Router();

// Helper: resolve userId from request
function resolveUserId(req: Request): string | null {
  let userId: string | null = (req as any)?.user?.id || (req as any)?.user?._id || null;
  if (!userId) {
    const cookie = req.headers?.cookie as string | undefined;
    const match = cookie?.match(/auth_token=([^;]+)/);
    if (match) {
      try {
        const token = decodeURIComponent(match[1]);
        const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
        const decoded: any = jwt.verify(token, secret);
        userId = decoded?.id || decoded?._id || null;
      } catch {}
    }
  }
  return userId;
}

// Zod schemas for validation
const NonEmptyString = z.string().trim().min(1);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const WeightLogSchema = z.object({ date: IsoDate, kg: z.number().min(30).max(400) });
const ExerciseProgressSchema = z.object({ exercise: NonEmptyString, date: IsoDate, value: z.number() });
const ExerciseProgressQuerySchema = z.object({ exercise: NonEmptyString, date: IsoDate }).strict();
const WorkoutLogSchema = z.object({ date: IsoDate.optional() }).strict();
const UuidParam = z.object({ userId: z.string().uuid() });

type Period = '7d' | '30d' | '90d' | 'ytd';

function generateDates(period: Period): string[] {
  const today = new Date();
  if (period === '7d') {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
  }
  if (period === '30d') {
    return Array.from({ length: 30 }).map((_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (29 - i));
      return d.toISOString().slice(0, 10);
    });
  }
  if (period === '90d') {
    return Array.from({ length: 90 }).map((_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (89 - i));
      return d.toISOString().slice(0, 10);
    });
  }
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const daysSince = Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  return Array.from({ length: daysSince + 1 }).map((_, i) => {
    const d = new Date(startOfYear); d.setDate(startOfYear.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// Recent changes endpoint
StudentRoutes.get('/:userId/changes', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limRaw = (req.query.limit as string) || '10';
    const limit = Math.max(1, Math.min(50, Number(limRaw) || 10));

    const items = await findMany(Tables.CHANGE_EVENTS, { user_id: userId }, {
      orderBy: 'created_at', ascending: false, limit,
    });

    return res.json({
      items: items.map((c: any) => ({
        id: c.id,
        date: c.created_at,
        type: c.type,
        summary: c.summary,
        rationale: c.rationale,
        actor: c.actor || undefined,
        before: c.before,
        after: c.after,
      }))
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load changes' });
  }
});

StudentRoutes.get('/me/changes', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const limRaw = (req.query.limit as string) || '10';
    const limit = Math.max(1, Math.min(50, Number(limRaw) || 10));
    if (!userId) return res.json({ items: [] });

    const items = await findMany(Tables.CHANGE_EVENTS, { user_id: userId }, {
      orderBy: 'created_at', ascending: false, limit,
    });

    return res.json({
      items: items.map((c: any) => ({
        id: c.id, date: c.created_at, type: c.type, summary: c.summary,
        rationale: c.rationale, actor: c.actor || undefined, before: c.before, after: c.after,
      }))
    });
  } catch {
    return res.status(500).json({ message: 'Failed to load changes' });
  }
});

// Snapshot helper
async function buildSnapshot(userId: string, period: Period) {
  const days = generateDates(period);
  const today = new Date();
  const start = days[0];
  const end = days[days.length - 1];

  // Weights
  const { data: weightRows } = await db
    .from(Tables.WEIGHT_ENTRIES)
    .select('date, kg')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true });

  const dbWeights = (weightRows || []) as { date: string; kg: number }[];
  const merged = days.map(d => dbWeights.find(w => w.date === d)).filter(Boolean);

  // Plans & goals
  const { data: currentTraining } = await db
    .from(Tables.TRAINING_PLANS)
    .select('*')
    .eq('user_id', userId)
    .eq('is_current', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: currentNutrition } = await db
    .from(Tables.NUTRITION_PLANS)
    .select('*')
    .eq('user_id', userId)
    .eq('is_current', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const changes = await findMany(Tables.CHANGE_EVENTS, { user_id: userId }, {
    orderBy: 'created_at', ascending: false, limit: 10,
  });

  const trainingSessions = (currentTraining?.sessions || []).map((s: any, idx: number) => ({
    id: currentTraining?.id,
    index: idx,
    date: today.toISOString(),
    day: s.day,
    focus: s.focus || `Økt ${idx + 1}`,
    sets: (s.exercises || []).map((e: any) => ({ exercise: e.name, sets: e.sets, reps: e.reps, weight: e.load })),
    guidelines: currentTraining?.guidelines || [],
    sourceText: currentTraining?.source_text || undefined,
  }));

  const payload: any = {
    weightTrend: merged,
    currentTrainingPlan: trainingSessions,
    currentNutritionPlan: currentNutrition ? [{
      id: currentNutrition.id,
      date: today.toISOString().slice(0, 10),
      dailyTargets: currentNutrition.daily_targets,
      meals: currentNutrition.meals || [],
      days: currentNutrition.days || [],
      guidelines: currentNutrition.guidelines || [],
      sourceText: currentNutrition.source_text || undefined,
    }] : [],
    planChanges: changes.map((c: any) => ({
      id: c.id, date: c.created_at,
      author: c.actor || 'coach-engh',
      area: c.type?.includes('NUTRITION') ? 'nutrition' : (c.type?.includes('PLAN') ? 'training' : 'other'),
      summary: c.summary,
    })),
    glance: {
      nextSession: { date: today.toISOString(), focus: 'Pull — rygg/biceps' },
      adherence7d: 0.86, adherence28d: 0.78,
      lastCheckIn: today.toISOString(),
      activeGoals: [],
    },
    topExercises: ['Markløft', 'Knebøy', 'Benkpress', 'Roing', 'Pull‑ups'],
  };

  // Goals
  try {
    const { data: currentGoal } = await db
      .from(Tables.GOALS)
      .select('*')
      .eq('user_id', userId)
      .eq('is_current', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentGoal) {
      const goals: string[] = [];
      if (currentGoal.target_weight_kg) goals.push(`Vektmål: ${currentGoal.target_weight_kg} kg`);
      if (currentGoal.strength_targets) goals.push(`Styrke: ${currentGoal.strength_targets}`);
      if (currentGoal.horizon_weeks) goals.push(`Horisont: ${currentGoal.horizon_weeks} uker`);
      payload.goals = goals.length ? goals : undefined;
      if (goals.length) payload.glance.activeGoals = goals;
      payload.currentGoal = currentGoal;
    }
  } catch {}

  return payload;
}

StudentRoutes.get('/:userId/snapshot', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    let userId = req.params.userId;
    if (!userId) userId = resolveUserId(req) || '';
    if (!userId) return res.status(400).json({ message: 'Bad userId' });
    const period = (req.query.period as Period) || '30d';
    const payload = await buildSnapshot(userId, period);
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load student snapshot' });
  }
});

StudentRoutes.get('/me/snapshot', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const period = (req.query.period as Period) || '30d';
    const payload = await buildSnapshot(userId, period);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load snapshot' });
  }
});

// Exercise Progress
StudentRoutes.get('/:userId/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as Period) || '30d';
    const exercise = (req.query.exercise as string) || '';
    const { userId } = req.params;
    const days = generateDates(period);

    let query = db.from(Tables.EXERCISE_PROGRESS)
      .select('date, value')
      .eq('user_id', userId)
      .gte('date', days[0])
      .lte('date', days[days.length - 1])
      .order('date', { ascending: true });

    if (exercise) query = query.eq('exercise', exercise);

    const { data: series } = await query;
    return res.status(200).json({ series: series || [], exercise });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load exercise progress' });
  }
});

StudentRoutes.get('/me/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const period = (req.query.period as Period) || '30d';
    const exercise = (req.query.exercise as string) || '';
    const days = generateDates(period);

    let query = db.from(Tables.EXERCISE_PROGRESS)
      .select('date, value')
      .eq('user_id', userId)
      .gte('date', days[0])
      .lte('date', days[days.length - 1])
      .order('date', { ascending: true });

    if (exercise) query = query.eq('exercise', exercise);

    const { data: series } = await query;
    return res.status(200).json({ series: series || [], exercise });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load exercise progress' });
  }
});

StudentRoutes.post('/me/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }),
  validateZod({ body: ExerciseProgressSchema }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const parsed = ExerciseProgressSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const { exercise, date, value } = parsed.data;
    await upsert(Tables.EXERCISE_PROGRESS, { user_id: userId, exercise, date, value }, 'user_id,exercise,date');
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to add exercise progress' });
  }
});

StudentRoutes.put('/me/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }),
  validateZod({ body: ExerciseProgressSchema }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const parsed = ExerciseProgressSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const { exercise, date, value } = parsed.data;
    await upsert(Tables.EXERCISE_PROGRESS, { user_id: userId, exercise, date, value }, 'user_id,exercise,date');
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update exercise progress' });
  }
});

StudentRoutes.delete('/me/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }),
  validateZod({ query: ExerciseProgressQuerySchema }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const exercise = req.query.exercise as string | undefined;
    const date = req.query.date as string | undefined;
    if (!userId || !exercise || !date) return res.status(400).json({ message: 'exercise and date query params required' });
    await db.from(Tables.EXERCISE_PROGRESS).delete().eq('user_id', userId).eq('exercise', exercise).eq('date', date);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete exercise progress' });
  }
});

// Weights
StudentRoutes.post('/:userId/weights', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }),
  validateZod({ body: WeightLogSchema }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const parsed = WeightLogSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const { date, kg } = parsed.data;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (date > todayIso) return res.status(400).json({ message: 'date cannot be in the future' });

    await upsert(Tables.WEIGHT_ENTRIES, { user_id: userId, date, kg }, 'user_id,date');

    try {
      await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: "WEIGHT_LOG", summary: `Weight ${kg}kg on ${date}`, actor: resolveUserId(req), after: { date, kg } });
      await publish({ type: "WEIGHT_LOGGED", user: userId, date, kg });
    } catch {}
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to record weight' });
  }
});

StudentRoutes.put('/:userId/weights', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }),
  validateZod({ body: WeightLogSchema }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const parsed = WeightLogSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const { date, kg } = parsed.data;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (date > todayIso) return res.status(400).json({ message: 'date cannot be in the future' });

    await upsert(Tables.WEIGHT_ENTRIES, { user_id: userId, date, kg }, 'user_id,date');

    try {
      await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: "WEIGHT_LOG", summary: `Weight updated to ${kg}kg on ${date}`, actor: resolveUserId(req), after: { date, kg } });
      await publish({ type: "WEIGHT_LOGGED", user: userId, date, kg });
    } catch {}
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update weight' });
  }
});

StudentRoutes.delete('/:userId/weights', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }),
  async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    const { userId } = req.params;
    if (!date) return res.status(400).json({ message: 'date query param is required' });

    await db.from(Tables.WEIGHT_ENTRIES).delete().eq('user_id', userId).eq('date', date);

    try {
      await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: "WEIGHT_LOG", summary: `Weight entry deleted for ${date}` });
      await publish({ type: "WEIGHT_DELETED", user: userId, date });
    } catch {}
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete weight' });
  }
});

// Exercise progress with userId param
StudentRoutes.post('/:userId/exercise-progress', ensureAuth as any,
  validateZod({ body: ExerciseProgressSchema }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { exercise, date, value } = req.body || {};
    if (!exercise || !date || typeof value !== 'number') return res.status(400).json({ message: 'exercise, date, value required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    await upsert(Tables.EXERCISE_PROGRESS, { user_id: userId, exercise, date, value }, 'user_id,exercise,date');
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to add exercise progress' });
  }
});

StudentRoutes.put('/:userId/exercise-progress', ensureAuth as any,
  validateZod({ body: ExerciseProgressSchema }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { exercise, date, value } = req.body || {};
    if (!exercise || !date || typeof value !== 'number') return res.status(400).json({ message: 'exercise, date, value required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    await upsert(Tables.EXERCISE_PROGRESS, { user_id: userId, exercise, date, value }, 'user_id,exercise,date');
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update exercise progress' });
  }
});

StudentRoutes.delete('/:userId/exercise-progress', ensureAuth as any,
  async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const exercise = req.query.exercise as string | undefined;
    const date = req.query.date as string | undefined;
    if (!exercise || !date) return res.status(400).json({ message: 'exercise and date query params required' });
    await db.from(Tables.EXERCISE_PROGRESS).delete().eq('user_id', userId).eq('exercise', exercise).eq('date', date);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete exercise progress' });
  }
});

// Log a workout
StudentRoutes.post('/me/workouts', validateZod({ body: WorkoutLogSchema }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const date = (req.body?.date as string) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    await upsert(Tables.WORKOUT_LOGS, { user_id: userId, date, entries: [] }, 'user_id,date');
    await publish({ type: 'WORKOUT_LOGGED', user: userId, date });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to log workout' });
  }
});

export default StudentRoutes;
