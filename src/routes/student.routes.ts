import { Router, Request, Response } from "express";
import { z } from 'zod';
import { Auth as ensureAuth } from '../app/Middlewares';
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';
import { WeightEntry } from "../app/Models/WeightEntry";
import { Types } from "mongoose";
import { TrainingPlan, NutritionPlan, Goal } from "../app/Models/PlanModels";
import ChangeEvent from "../models/ChangeEvent";
import { publish } from "../services/events/publish";
import jwt from 'jsonwebtoken';
import { ExerciseProgress } from "../app/Models/ExerciseProgress";
import WorkoutLog from "../models/WorkoutLog";

const StudentRoutes: Router = Router();
// Recent changes endpoint
StudentRoutes.get('/:userId/changes', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as any;
    const limRaw = (req.query.limit as string) || '10';
    const limit = Math.max(1, Math.min(50, Number(limRaw) || 10));
    if (!Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Bad userId' });
    const items = await ChangeEvent.find({ user: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ items: items.map((c:any)=>({
      id: String(c._id),
      date: c.createdAt,
      type: c.type,
      summary: c.summary,
      rationale: c.rationale,
      actor: c.actor ? String(c.actor) : undefined,
      before: c.before,
      after: c.after,
    })) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load changes' });
  }
});

// Resolve current user's changes via cookie/JWT for convenience
StudentRoutes.get('/me/changes', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req: Request, res: Response) => {
  try {
    let resolvedUserId: any = (req as any)?.user?._id;
    if (!resolvedUserId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
          const decoded: any = jwt.verify(token, secret);
          resolvedUserId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    const limRaw = (req.query.limit as string) || '10';
    const limit = Math.max(1, Math.min(50, Number(limRaw) || 10));
    if (!resolvedUserId || !Types.ObjectId.isValid(resolvedUserId)) return res.status(401).json({ message: 'Unauthorized' });
    const items = await ChangeEvent.find({ user: new Types.ObjectId(resolvedUserId) }).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ items: items.map((c:any)=>({ id: String(c._id), date: c.createdAt, type: c.type, summary: c.summary, rationale: c.rationale, actor: c.actor ? String(c.actor) : undefined, before: c.before, after: c.after })) });
  } catch {
    return res.status(500).json({ message: 'Failed to load changes' });
  }
});

// Zod schemas for validation
const NonEmptyString = z.string().trim().min(1);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const WeightLogSchema = z.object({ date: IsoDate, kg: z.number().min(30).max(400) });
const ExerciseProgressSchema = z.object({ exercise: NonEmptyString, date: IsoDate, value: z.number() });

type Period = '7d' | '30d' | '90d' | 'ytd';

function generateDates(period: Period): string[] {
  const today = new Date();
  if (period === '7d') {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
  }
  if (period === '30d') {
    return Array.from({ length: 30 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (29 - i));
      return d.toISOString().slice(0, 10);
    });
  }
  if (period === '90d') {
    return Array.from({ length: 90 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (89 - i));
      return d.toISOString().slice(0, 10);
    });
  }
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const daysSince = Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  return Array.from({ length: daysSince + 1 }).map((_, i) => {
    const d = new Date(startOfYear);
    d.setDate(startOfYear.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

StudentRoutes.get('/:userId/snapshot', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    let { userId } = req.params as any;
    const period = (req.query.period as Period) || '30d';
    const days = generateDates(period);

    const today = new Date();
    // Pull actual weights for selected period using date range
    let dbWeights = [] as { date: string; kg: number }[];
    try {
      let resolvedUserId = Types.ObjectId.isValid(userId) ? userId : (req as any)?.user?._id;
      if (!resolvedUserId) {
        const cookie = req.headers?.cookie as string | undefined;
        const match = cookie?.match(/auth_token=([^;]+)/);
        if (match) {
          try {
            const token = decodeURIComponent(match[1]);
            const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
            const decoded: any = jwt.verify(token, secret);
            resolvedUserId = decoded?.id || decoded?._id;
          } catch {}
        }
      }
      if (resolvedUserId && Types.ObjectId.isValid(resolvedUserId)) {
        const start = days[0];
        const end = days[days.length - 1];
        const entries = await WeightEntry.find({
            userId: new Types.ObjectId(resolvedUserId),
            date: { $gte: start, $lte: end },
          })
          .select('date kg -_id')
          .lean();
        dbWeights = entries as any;
      }
    } catch {}

    const merged = days.map(d => dbWeights.find(w => w.date === d)).filter(Boolean) as {date:string; kg:number}[];

    // Read current plans/goals
    let resolvedUserIdForPlans: any = Types.ObjectId.isValid(userId) ? userId : (req as any)?.user?._id;
    if (!resolvedUserIdForPlans) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
          const decoded: any = jwt.verify(token, secret);
          resolvedUserIdForPlans = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    let currentTraining = resolvedUserIdForPlans && Types.ObjectId.isValid(resolvedUserIdForPlans)
      ? await TrainingPlan.findOne({ userId: resolvedUserIdForPlans, isCurrent: true }).sort({ version: -1 }).lean()
      : null;
    let currentNutrition = resolvedUserIdForPlans && Types.ObjectId.isValid(resolvedUserIdForPlans)
      ? await NutritionPlan.findOne({ userId: resolvedUserIdForPlans, isCurrent: true }).sort({ version: -1 }).lean()
      : null;
    const changes = resolvedUserIdForPlans && Types.ObjectId.isValid(resolvedUserIdForPlans)
      ? await ChangeEvent.find({ user: new Types.ObjectId(resolvedUserIdForPlans) }).sort({ createdAt: -1 }).limit(10).lean()
      : [];

    const trainingSessions = (currentTraining?.sessions || []).map((s:any, idx:number)=>({
      id: String(currentTraining?._id),
      index: idx,
      date: today.toISOString(),
      day: s.day,
      focus: s.focus || `Økt ${idx+1}`,
      sets: (s.exercises||[]).map((e:any)=>({ exercise: e.name, sets: e.sets, reps: e.reps, weight: e.load })),
      guidelines: (currentTraining as any)?.guidelines || [],
      sourceText: (currentTraining as any)?.sourceText || undefined,
    }));

  const payload = {
      weightTrend: merged,
      currentTrainingPlan: trainingSessions,
      currentNutritionPlan: currentNutrition ? [
        {
          id: String((currentNutrition as any)._id),
          date: today.toISOString().slice(0, 10),
          dailyTargets: (currentNutrition as any).dailyTargets,
          meals: (currentNutrition as any).meals || [],
          days: (currentNutrition as any).days || [],
          guidelines: (currentNutrition as any).guidelines || [],
          sourceText: (currentNutrition as any).sourceText || undefined,
        },
      ] : [],
      planChanges: changes.map((c:any)=>({ id: String(c._id), date: c.createdAt, author: 'coach-engh', area: c.area, summary: c.summary })),
      glance: {
        nextSession: { date: today.toISOString(), focus: 'Pull — rygg/biceps' },
        adherence7d: 0.86,
        adherence28d: 0.78,
        lastCheckIn: today.toISOString(),
        activeGoals: ['-3kg på 6 uker', 'Øke 5RM markløft'],
      },
      topExercises: ['Markløft', 'Knebøy', 'Benkpress', 'Roing', 'Pull‑ups'],
    };

    try {
      if (resolvedUserIdForPlans && Types.ObjectId.isValid(resolvedUserIdForPlans)) {
        const currentGoal = await Goal.findOne({ userId: resolvedUserIdForPlans, isCurrent: true }).sort({ version: -1 }).lean();
        if (currentGoal) {
          const goals: string[] = [];
          if ((currentGoal as any).targetWeightKg) goals.push(`Vektmål: ${(currentGoal as any).targetWeightKg} kg`);
          if ((currentGoal as any).strengthTargets) goals.push(`Styrke: ${(currentGoal as any).strengthTargets}`);
          if ((currentGoal as any).horizonWeeks) goals.push(`Horisont: ${(currentGoal as any).horizonWeeks} uker`);
          // @ts-ignore
          payload.goals = goals.length ? goals : undefined;
          // @ts-ignore
          if (goals.length) payload.glance.activeGoals = goals;
          // expose structured goal for plans/goals page
          // @ts-ignore
          payload.currentGoal = currentGoal;
        }
      }
    } catch {}

    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load student snapshot' });
  }
});

// Convenience route: resolve userId from cookie/JWT and return snapshot
StudentRoutes.get('/me/snapshot', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    // Resolve user id
    let resolvedUserId: any = (req as any)?.user?._id;
    if (!resolvedUserId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
          const decoded: any = jwt.verify(token, secret);
          resolvedUserId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    if (!resolvedUserId || !Types.ObjectId.isValid(resolvedUserId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const period = (req.query.period as any as Period) || '30d';
    const days = generateDates(period);
    const today = new Date();

    // weights
    let dbWeights: { date: string; kg: number }[] = [];
    try {
      const start = days[0];
      const end = days[days.length - 1];
      const entries = await WeightEntry.find({
        userId: new Types.ObjectId(resolvedUserId),
        date: { $gte: start, $lte: end },
      })
        .select('date kg -_id')
        .lean();
      dbWeights = entries as any;
    } catch {}
    const merged = days.map((d) => dbWeights.find((w) => w.date === d)).filter(Boolean) as any;

    // plans/goals
    const currentTraining = await TrainingPlan.findOne({ userId: resolvedUserId, isCurrent: true })
      .sort({ version: -1 })
      .lean();
    const currentNutrition = await NutritionPlan.findOne({ userId: resolvedUserId, isCurrent: true })
      .sort({ version: -1 })
      .lean();
    const changes = await ChangeEvent.find({ user: new Types.ObjectId(resolvedUserId) }).sort({ createdAt: -1 }).limit(10).lean();
    const trainingSessions = (currentTraining?.sessions || []).map((s: any, idx: number) => ({
      id: String(currentTraining?._id),
      index: idx,
      date: today.toISOString(),
      day: s.day,
      focus: s.focus || `Økt ${idx+1}`,
      sets: (s.exercises || []).map((e: any) => ({ exercise: e.name, sets: e.sets, reps: e.reps, weight: e.load })),
      guidelines: (currentTraining as any)?.guidelines || [],
      sourceText: (currentTraining as any)?.sourceText || undefined,
    }));

    const payload: any = {
      weightTrend: merged,
      currentTrainingPlan: trainingSessions,
      currentNutritionPlan: currentNutrition
        ? [
            {
              id: String((currentNutrition as any)._id),
              date: today.toISOString().slice(0, 10),
              dailyTargets: (currentNutrition as any).dailyTargets,
              meals: (currentNutrition as any).meals || [],
              days: (currentNutrition as any).days || [],
              guidelines: (currentNutrition as any).guidelines || [],
              sourceText: (currentNutrition as any).sourceText || undefined,
            },
          ]
        : [],
      planChanges: changes.map((c: any) => ({ id: String(c._id), date: c.createdAt, author: String(c.actor || 'coach-engh'), area: c.type.includes('NUTRITION') ? 'nutrition' : (c.type.includes('PLAN') ? 'training' : 'other'), summary: c.summary })),
      glance: {
        nextSession: { date: today.toISOString(), focus: 'Pull — rygg/biceps' },
        adherence7d: 0.86,
        adherence28d: 0.78,
        lastCheckIn: today.toISOString(),
        activeGoals: [],
      },
      topExercises: ['Markløft', 'Knebøy', 'Benkpress', 'Roing', 'Pull‑ups'],
    };

    try {
      const currentGoal = await Goal.findOne({ userId: resolvedUserId, isCurrent: true })
        .sort({ version: -1 })
        .lean();
      if (currentGoal) {
        const goals: string[] = [];
        if ((currentGoal as any).targetWeightKg) goals.push(`Vektmål: ${(currentGoal as any).targetWeightKg} kg`);
        if ((currentGoal as any).strengthTargets) goals.push(`Styrke: ${(currentGoal as any).strengthTargets}`);
        if ((currentGoal as any).horizonWeeks) goals.push(`Horisont: ${(currentGoal as any).horizonWeeks} uker`);
        payload.goals = goals.length ? goals : undefined;
        if (goals.length) payload.glance.activeGoals = goals;
      }
    } catch {}

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load snapshot' });
  }
});

StudentRoutes.get('/:userId([0-9a-fA-F]{24})/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as Period) || '30d';
    const exercise = (req.query.exercise as string) || '';
    const { userId } = req.params as any;

    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Bad userId' });
    }
    const days = generateDates(period);
    const start = days[0];
    const end = days[days.length - 1];
    const series = await ExerciseProgress.find({
      userId: new Types.ObjectId(userId),
      exercise: exercise || { $exists: true },
      date: { $gte: start, $lte: end },
    }).select('date value -_id').sort({ date: 1 }).lean();
    return res.status(200).json({ series, exercise });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load exercise progress' });
  }
});

// /me exercise-progress variants resolve user from cookie/JWT like snapshot
StudentRoutes.get('/me/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req: Request, res: Response) => {
  try {
    // resolve user id from cookie/JWT
    let resolvedUserId: any = (req as any)?.user?._id;
    if (!resolvedUserId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
          const decoded: any = jwt.verify(token, secret);
          resolvedUserId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    if (!resolvedUserId || !Types.ObjectId.isValid(resolvedUserId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const period = (req.query.period as Period) || '30d';
    const exercise = (req.query.exercise as string) || '';
    const days = generateDates(period);
    const start = days[0];
    const end = days[days.length - 1];
    const series = await ExerciseProgress.find({
      userId: new Types.ObjectId(resolvedUserId),
      exercise: exercise || { $exists: true },
      date: { $gte: start, $lte: end },
    }).select('date value -_id').sort({ date: 1 }).lean();
    return res.status(200).json({ series, exercise });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load exercise progress' });
  }
});

StudentRoutes.post('/me/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    let resolvedUserId: any = (req as any)?.user?._id;
    if (!resolvedUserId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
          const decoded: any = jwt.verify(token, secret);
          resolvedUserId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    const parsed = ExerciseProgressSchema.safeParse(req.body || {});
    if (!resolvedUserId || !Types.ObjectId.isValid(resolvedUserId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const { exercise, date, value } = parsed.data;
    await ExerciseProgress.updateOne(
      { userId: new Types.ObjectId(resolvedUserId), exercise, date },
      { $set: { value } },
      { upsert: true }
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to add exercise progress' });
  }
});

StudentRoutes.put('/me/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    let resolvedUserId: any = (req as any)?.user?._id;
    if (!resolvedUserId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
          const decoded: any = jwt.verify(token, secret);
          resolvedUserId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    const parsed = ExerciseProgressSchema.safeParse(req.body || {});
    if (!resolvedUserId || !Types.ObjectId.isValid(resolvedUserId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const { exercise, date, value } = parsed.data;
    await ExerciseProgress.updateOne(
      { userId: new Types.ObjectId(resolvedUserId), exercise, date },
      { $set: { value } },
      { upsert: true }
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update exercise progress' });
  }
});

StudentRoutes.delete('/me/exercise-progress', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    let resolvedUserId: any = (req as any)?.user?._id;
    if (!resolvedUserId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
          const decoded: any = jwt.verify(token, secret);
          resolvedUserId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    const exercise = req.query.exercise as string | undefined;
    const date = req.query.date as string | undefined;
    if (!resolvedUserId || !Types.ObjectId.isValid(resolvedUserId) || !exercise || !date) {
      return res.status(400).json({ message: 'exercise and date query params required' });
    }
    await ExerciseProgress.deleteOne({ userId: new Types.ObjectId(resolvedUserId), exercise, date });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete exercise progress' });
  }
});

// Minimal weight check-in endpoint (placeholder for real persistence)
StudentRoutes.post('/:userId/weights', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const parsed = WeightLogSchema.safeParse(req.body || {});
    if (!Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Bad userId' });
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const { date, kg } = parsed.data;
    // basic validation: ISO date not in future
    const todayIso = new Date().toISOString().slice(0,10);
    if (date > todayIso) {
      return res.status(400).json({ message: 'date cannot be in the future' });
    }
    await WeightEntry.updateOne(
      { userId: new Types.ObjectId(userId), date },
      { $set: { kg } },
      { upsert: true }
    );
    try {
      await ChangeEvent.create({ user: new Types.ObjectId(userId), type: "WEIGHT_LOG", summary: `Weight ${kg}kg on ${date}` , actor: (req as any)?.user?._id, after: { date, kg } });
      await publish({ type: "WEIGHT_LOGGED", user: new Types.ObjectId(userId), date, kg });
    } catch {}
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to record weight' });
  }
});

// Update a weight entry (upsert) for a given date
StudentRoutes.put('/:userId/weights', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const parsed = WeightLogSchema.safeParse(req.body || {});
    if (!Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Bad userId' });
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const { date, kg } = parsed.data;
    const todayIso = new Date().toISOString().slice(0,10);
    if (date > todayIso) {
      return res.status(400).json({ message: 'date cannot be in the future' });
    }
    await WeightEntry.updateOne(
      { userId: new Types.ObjectId(userId), date },
      { $set: { kg } },
      { upsert: true }
    );
    try {
      await ChangeEvent.create({ user: new Types.ObjectId(userId), type: "WEIGHT_LOG", summary: `Weight updated to ${kg}kg on ${date}`, actor: (req as any)?.user?._id, after: { date, kg } });
      await publish({ type: "WEIGHT_LOGGED", user: new Types.ObjectId(userId), date, kg });
    } catch {}
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update weight' });
  }
});

// Delete a weight entry by date
StudentRoutes.delete('/:userId/weights', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    const { userId } = req.params;
    if (!date || !Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'date query param is required' });
    await WeightEntry.deleteOne({ userId: new Types.ObjectId(userId), date });
    try {
      await ChangeEvent.create({ user: new Types.ObjectId(userId), type: "WEIGHT_LOG", summary: `Weight entry deleted for ${date}` });
      await publish({ type: "WEIGHT_DELETED", user: new Types.ObjectId(userId), date });
    } catch {}
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete weight' });
  }
});

// Create exercise progress entry
StudentRoutes.post('/:userId([0-9a-fA-F]{24})/exercise-progress', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { exercise, date, value } = req.body || {};
    if (!Types.ObjectId.isValid(userId) || !exercise || !date || typeof value !== 'number') {
      return res.status(400).json({ message: 'exercise, date, value required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    await ExerciseProgress.updateOne(
      { userId: new Types.ObjectId(userId), exercise, date },
      { $set: { value } },
      { upsert: true }
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to add exercise progress' });
  }
});

// Update exercise progress entry
StudentRoutes.put('/:userId([0-9a-fA-F]{24})/exercise-progress', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { exercise, date, value } = req.body || {};
    if (!Types.ObjectId.isValid(userId) || !exercise || !date || typeof value !== 'number') {
      return res.status(400).json({ message: 'exercise, date, value required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    await ExerciseProgress.updateOne(
      { userId: new Types.ObjectId(userId), exercise, date },
      { $set: { value } },
      { upsert: true }
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update exercise progress' });
  }
});

// Delete exercise progress entry
StudentRoutes.delete('/:userId([0-9a-fA-F]{24})/exercise-progress', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const exercise = req.query.exercise as string | undefined;
    const date = req.query.date as string | undefined;
    if (!Types.ObjectId.isValid(userId) || !exercise || !date) {
      return res.status(400).json({ message: 'exercise and date query params required' });
    }
    await ExerciseProgress.deleteOne({ userId: new Types.ObjectId(userId), exercise, date });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete exercise progress' });
  }
});

// Log a workout day (mark done today or specific date)
StudentRoutes.post('/me/workouts', async (req: Request, res: Response) => {
  try {
    // resolve user id from cookie/JWT
    let resolvedUserId: any = (req as any)?.user?._id;
    if (!resolvedUserId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me';
          const decoded: any = jwt.verify(token, secret);
          resolvedUserId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    if (!resolvedUserId || !Types.ObjectId.isValid(resolvedUserId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const date = (req.body?.date as string) || new Date().toISOString().slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    await WorkoutLog.updateOne({ user: new Types.ObjectId(resolvedUserId), date }, { $setOnInsert: { entries: [] } }, { upsert: true });
    await publish({ type: 'WORKOUT_LOGGED', user: new Types.ObjectId(resolvedUserId), date });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to log workout' });
  }
});

export default StudentRoutes;


