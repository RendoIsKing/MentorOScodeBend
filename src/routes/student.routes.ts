import { Router, Request, Response } from "express";
import { z } from 'zod';
import { Auth as ensureAuth, validateZod } from '../app/Middlewares';
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';
import { db, findMany, insertOne, upsert, Tables } from "../lib/db";
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

// ── /me routes MUST be defined BEFORE /:userId routes ──
// (Express treats /:userId as a catch-all that would match "me" literally)

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
        id: c.id, date: c.created_at, type: c.type, summary: c.summary,
        rationale: c.rationale, actor: c.actor || undefined, before: c.before, after: c.after,
      }))
    });
  } catch (err) {
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

  // Plans & goals — check both legacy tables and versioned tables
  console.log(`[snapshot] Fetching plans for user=${userId}`);
  const [legacyTrainingResult, legacyNutritionResult, versionedTrainingResult, versionedNutritionResult] = await Promise.all([
    db.from(Tables.TRAINING_PLANS).select('*').eq('user_id', userId).eq('is_current', true).order('version', { ascending: false }).limit(1).maybeSingle()
      .then(r => { if (r.error) console.error(`[snapshot] TRAINING_PLANS query error:`, r.error.message); return r; }),
    db.from(Tables.NUTRITION_PLANS).select('*').eq('user_id', userId).eq('is_current', true).order('version', { ascending: false }).limit(1).maybeSingle()
      .then(r => { if (r.error) console.error(`[snapshot] NUTRITION_PLANS query error:`, r.error.message); return r; }),
    db.from(Tables.TRAINING_PLAN_VERSIONS).select('*').eq('user_id', userId).order('version', { ascending: false }).limit(1).maybeSingle()
      .then(r => { if (r.error) console.error(`[snapshot] TRAINING_PLAN_VERSIONS query error:`, r.error.message); return r; }),
    db.from(Tables.NUTRITION_PLAN_VERSIONS).select('*').eq('user_id', userId).order('version', { ascending: false }).limit(1).maybeSingle()
      .then(r => { if (r.error) console.error(`[snapshot] NUTRITION_PLAN_VERSIONS query error:`, r.error.message); return r; }),
  ]);

  const currentTraining = legacyTrainingResult.data;
  const currentNutrition = legacyNutritionResult.data;
  const versionedTraining = versionedTrainingResult.data;
  const versionedNutrition = versionedNutritionResult.data;

  // Debug logging for training plan investigation
  console.log(`[snapshot] user=${userId} versionedTraining=${versionedTraining ? `v${versionedTraining.version}, days_count=${Array.isArray(versionedTraining.days) ? versionedTraining.days.length : 'NOT_ARRAY'}, days_type=${typeof versionedTraining.days}` : 'NULL'} legacyTraining=${currentTraining ? 'exists' : 'NULL'}`);

  const changes = await findMany(Tables.CHANGE_EVENTS, { user_id: userId }, {
    orderBy: 'created_at', ascending: false, limit: 10,
  });

  // Build training sessions from legacy OR versioned data
  let trainingSessions: any[] = [];
  if (versionedTraining?.days?.length) {
    // Prefer versioned training plan (newer system, used by agent)
    trainingSessions = (versionedTraining.days as any[]).map((d: any, idx: number) => ({
      id: versionedTraining.id,
      index: idx,
      date: versionedTraining.created_at || today.toISOString(),
      day: d.day,
      focus: d.focus || `Økt ${idx + 1}`,
      sets: (d.exercises || []).map((e: any) => ({ exercise: e.name, sets: e.sets, reps: e.reps, weight: e.load || e.rpe })),
      notes: d.notes,
      guidelines: [],
      version: versionedTraining.version,
    }));
  } else if (currentTraining?.sessions?.length) {
    trainingSessions = (currentTraining.sessions as any[]).map((s: any, idx: number) => ({
      id: currentTraining.id,
      index: idx,
      date: today.toISOString(),
      day: s.day,
      focus: s.focus || `Økt ${idx + 1}`,
      sets: (s.exercises || []).map((e: any) => ({ exercise: e.name, sets: e.sets, reps: e.reps, weight: e.load })),
      guidelines: currentTraining.guidelines || [],
      sourceText: currentTraining.source_text || undefined,
    }));
  }

  // Build nutrition plan from legacy OR versioned data
  let nutritionPlanPayload: any[] = [];
  if (versionedNutrition) {
    nutritionPlanPayload = [{
      id: versionedNutrition.id,
      date: (versionedNutrition.created_at || today.toISOString()).slice(0, 10),
      dailyTargets: {
        kcal: versionedNutrition.kcal,
        protein: versionedNutrition.protein_grams,
        carbs: versionedNutrition.carbs_grams,
        fat: versionedNutrition.fat_grams,
      },
      meals: currentNutrition?.meals || [],
      days: currentNutrition?.days || [],
      guidelines: currentNutrition?.guidelines || [],
      version: versionedNutrition.version,
    }];
  } else if (currentNutrition) {
    nutritionPlanPayload = [{
      id: currentNutrition.id,
      date: today.toISOString().slice(0, 10),
      dailyTargets: currentNutrition.daily_targets,
      meals: currentNutrition.meals || [],
      days: currentNutrition.days || [],
      guidelines: currentNutrition.guidelines || [],
      sourceText: currentNutrition.source_text || undefined,
    }];
  }

  // Today's meal logs
  const todayStr = today.toISOString().slice(0, 10);
  const { data: todayMealRows } = await db
    .from(Tables.MEAL_LOGS)
    .select('id, date, meal_type, description, total_calories, total_protein_g, total_carbs_g, total_fat_g, items, created_at')
    .eq('user_id', userId)
    .eq('date', todayStr)
    .order('created_at', { ascending: true });

  const todayMeals = (todayMealRows || []) as any[];
  const todayTotals = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + (Number(m.total_calories) || 0),
      protein: acc.protein + (Number(m.total_protein_g) || 0),
      carbs: acc.carbs + (Number(m.total_carbs_g) || 0),
      fat: acc.fat + (Number(m.total_fat_g) || 0),
      meal_count: acc.meal_count + 1,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, meal_count: 0 },
  );

  // Recent workout logs (last 14 days)
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const { data: workoutRows } = await db
    .from(Tables.WORKOUT_LOGS)
    .select('id, date, entries, created_at')
    .eq('user_id', userId)
    .gte('date', twoWeeksAgo.toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(20);

  const recentWorkouts = (workoutRows || []) as any[];

  // User points summary
  let totalPoints = 0;
  let pointsByCategory: Record<string, number> = {};
  try {
    const { data: pointRows } = await db
      .from('user_points')
      .select('category, points')
      .eq('user_id', userId);
    if (pointRows) {
      for (const r of pointRows as any[]) {
        totalPoints += Number(r.points) || 0;
        pointsByCategory[r.category] = (pointsByCategory[r.category] || 0) + (Number(r.points) || 0);
      }
    }
  } catch {}

  // Calculate real adherence from workout logs
  const last7 = new Date(today); last7.setDate(last7.getDate() - 7);
  const last28 = new Date(today); last28.setDate(last28.getDate() - 28);
  const workoutsLast7 = recentWorkouts.filter(w => w.date >= last7.toISOString().slice(0, 10)).length;
  const workoutsLast28 = recentWorkouts.filter(w => w.date >= last28.toISOString().slice(0, 10)).length;

  const payload: any = {
    weightTrend: merged,
    currentTrainingPlan: trainingSessions,
    currentNutritionPlan: nutritionPlanPayload,
    todayMeals,
    todayTotals,
    recentWorkouts,
    points: { total: totalPoints, byCategory: pointsByCategory },
    planChanges: changes.map((c: any) => ({
      id: c.id, date: c.created_at,
      author: c.actor || 'coach-engh',
      area: c.type?.includes('NUTRITION') ? 'nutrition' : (c.type?.includes('PLAN') ? 'training' : 'other'),
      summary: c.summary,
    })),
    glance: {
      workoutsLast7d: workoutsLast7,
      workoutsLast28d: workoutsLast28,
      mealsLoggedToday: todayTotals.meal_count,
      caloriesLoggedToday: todayTotals.calories,
      lastCheckIn: today.toISOString(),
      activeGoals: [],
    },
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

// /me/snapshot MUST be before /:userId/snapshot
StudentRoutes.get('/me/snapshot', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    console.log(`[snapshot] /me/snapshot resolved userId=${userId}`);
    const period = (req.query.period as Period) || '30d';
    const payload = await buildSnapshot(userId, period);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load snapshot' });
  }
});

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

// Check if user has completed onboarding (cross-device sync)
StudentRoutes.get('/me/onboarding-profile', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Check user_context for entries saved during onboarding
    const rows = await findMany(Tables.USER_CONTEXT, { user_id: userId, source: 'onboarding' }, { select: 'key, value' });

    if (!rows || rows.length === 0) {
      return res.json({ onboarded: false, profile: null });
    }

    // Reconstruct the onboarding profile from key-value pairs
    const ctx: Record<string, string> = {};
    for (const row of rows) ctx[row.key] = row.value;

    const genderMap: Record<string, string> = { 'Mann': 'male', 'Kvinne': 'female', 'Annet': 'other' };
    const expMap: Record<string, string> = { 'Nybegynner': 'beginner', 'Middels erfaren': 'intermediate', 'Avansert': 'advanced' };
    const stressMap: Record<string, string> = { 'Lavt': 'low', 'Moderat': 'moderate', 'Høyt': 'high' };
    const equipMap: Record<string, string> = { 'Fullt treningssenter': 'full_gym', 'Hjemme med basisk utstyr': 'home_basic', 'Kun kroppsvekt': 'bodyweight_only' };
    const goalMap: Record<string, string> = { 'Vektnedgang': 'weight_loss', 'Muskeloppbygging': 'muscle_gain', 'Styrke': 'strength', 'Generell fitness': 'general_fitness', 'Kroppsrekomposisjon': 'body_recomp' };

    const profile = {
      name: ctx['navn'] || '',
      age: parseInt(ctx['alder'] || '0', 10),
      gender: genderMap[ctx['kjønn'] || ''] || 'other',
      currentWeight: parseFloat(ctx['nåværende_vekt_kg'] || '0'),
      goalWeight: parseFloat(ctx['målvekt_kg'] || '0'),
      height: parseInt(ctx['høyde_cm'] || '0', 10),
      trainingDaysPerWeek: parseInt(ctx['treningsdager_per_uke'] || '3', 10),
      experienceLevel: expMap[ctx['erfaringsnivå'] || ''] || 'beginner',
      primaryGoal: (ctx['treningsmål'] || '').split(', ').map(g => goalMap[g] || g).filter(Boolean),
      dietaryPreferences: (ctx['kostpreferanser'] || '').split(', ').filter(Boolean),
      allergies: (ctx['allergier'] || '').split(', ').filter(Boolean),
      injuries: (ctx['skader'] || '').split(', ').filter(Boolean),
      sleepHoursPerNight: parseInt(ctx['søvn_timer_per_natt'] || '7', 10),
      stressLevel: stressMap[ctx['stressnivå'] || ''] || 'moderate',
      availableEquipment: equipMap[ctx['tilgjengelig_utstyr'] || ''] || 'full_gym',
    };

    return res.json({ onboarded: true, profile });
  } catch (err: any) {
    console.error('[student] Failed to check onboarding profile:', err?.message || err);
    return res.status(500).json({ message: 'Failed to check onboarding profile' });
  }
});

// Save onboarding profile data to database (called from frontend after coach onboarding flow)
StudentRoutes.post('/me/onboarding-profile', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 10 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const data = req.body || {};
    console.log(`[student] Saving onboarding profile for user=${userId}`);

    // Map onboarding form fields to user_profiles columns
    const profileRow: Record<string, any> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    // Direct column mappings
    if (data.currentWeight) profileRow.current_weight_kg = data.currentWeight;
    if (data.trainingDaysPerWeek) profileRow.training_days_per_week = data.trainingDaysPerWeek;
    if (data.injuries?.length) profileRow.injury_history = data.injuries.join(', ');
    if (data.dietaryPreferences?.length) profileRow.nutrition_preferences = data.dietaryPreferences.join(', ');

    // Build goals string from primaryGoal array
    const goalLabels: Record<string, string> = {
      weight_loss: 'Vektnedgang', muscle_gain: 'Muskeloppbygging', strength: 'Styrke',
      general_fitness: 'Generell fitness', body_recomp: 'Kroppsrekomposisjon',
    };
    if (Array.isArray(data.primaryGoal) && data.primaryGoal.length) {
      profileRow.goals = data.primaryGoal.map((g: string) => goalLabels[g] || g).join(', ');
    }

    // Upsert into user_profiles
    await upsert(Tables.USER_PROFILES, profileRow, 'user_id');

    // Save additional fields to user_context (key-value store) for the AI to access
    const contextEntries: [string, string][] = [];
    if (data.name) contextEntries.push(['navn', data.name]);
    if (data.age) contextEntries.push(['alder', String(data.age)]);
    if (data.gender) contextEntries.push(['kjønn', data.gender === 'male' ? 'Mann' : data.gender === 'female' ? 'Kvinne' : 'Annet']);
    if (data.currentWeight) contextEntries.push(['nåværende_vekt_kg', String(data.currentWeight)]);
    if (data.goalWeight) contextEntries.push(['målvekt_kg', String(data.goalWeight)]);
    if (data.height) contextEntries.push(['høyde_cm', String(data.height)]);
    if (data.trainingDaysPerWeek) contextEntries.push(['treningsdager_per_uke', String(data.trainingDaysPerWeek)]);
    if (data.experienceLevel) {
      const expLabels: Record<string, string> = { beginner: 'Nybegynner', intermediate: 'Middels erfaren', advanced: 'Avansert' };
      contextEntries.push(['erfaringsnivå', expLabels[data.experienceLevel] || data.experienceLevel]);
    }
    if (data.sleepHoursPerNight) contextEntries.push(['søvn_timer_per_natt', String(data.sleepHoursPerNight)]);
    if (data.stressLevel) {
      const stressLabels: Record<string, string> = { low: 'Lavt', moderate: 'Moderat', high: 'Høyt' };
      contextEntries.push(['stressnivå', stressLabels[data.stressLevel] || data.stressLevel]);
    }
    if (data.availableEquipment) {
      const equipLabels: Record<string, string> = { full_gym: 'Fullt treningssenter', home_basic: 'Hjemme med basisk utstyr', bodyweight_only: 'Kun kroppsvekt' };
      contextEntries.push(['tilgjengelig_utstyr', equipLabels[data.availableEquipment] || data.availableEquipment]);
    }
    if (data.allergies?.length) contextEntries.push(['allergier', data.allergies.join(', ')]);
    if (data.dietaryPreferences?.length) contextEntries.push(['kostpreferanser', data.dietaryPreferences.join(', ')]);
    if (data.injuries?.length) contextEntries.push(['skader', data.injuries.join(', ')]);
    if (Array.isArray(data.primaryGoal) && data.primaryGoal.length) {
      contextEntries.push(['treningsmål', data.primaryGoal.map((g: string) => goalLabels[g] || g).join(', ')]);
    }

    // Upsert all context entries in parallel
    await Promise.all(
      contextEntries.map(([key, value]) =>
        upsert(Tables.USER_CONTEXT, {
          user_id: userId,
          key,
          value,
          source: 'onboarding',
          updated_at: new Date().toISOString(),
        }, 'user_id,key').catch(() => {})
      )
    );

    console.log(`[student] Onboarding profile saved: ${Object.keys(profileRow).length} profile fields, ${contextEntries.length} context entries`);
    return res.json({ ok: true, profileFields: Object.keys(profileRow).length, contextEntries: contextEntries.length });
  } catch (err: any) {
    console.error('[student] Failed to save onboarding profile:', err?.message || err);
    return res.status(500).json({ message: 'Failed to save onboarding profile' });
  }
});

// Get onboarding profile for a specific student (mentor access — reads from user_context)
StudentRoutes.get('/:userId/onboarding-profile', ensureAuth as any, async (req: Request, res: Response) => {
  try {
    const mentorId = resolveUserId(req);
    if (!mentorId) return res.status(401).json({ message: 'Unauthorized' });

    const reqUser = req.user as any;
    if (!reqUser?.isMentor) return res.status(403).json({ message: 'Mentor access required' });

    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'Missing userId' });

    // Verify mentor-client relationship via subscriptions + subscription_plans
    const { data: mentorPlans } = await db.from(Tables.SUBSCRIPTION_PLANS).select('id').eq('user_id', mentorId).eq('is_deleted', false);
    const planIds = (mentorPlans || []).map((p: any) => p.id);
    if (planIds.length === 0) return res.status(403).json({ message: 'No mentor-client relationship' });

    const { data: activeSub } = await db.from(Tables.SUBSCRIPTIONS).select('id').in('plan_id', planIds).eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle();
    if (!activeSub) return res.status(403).json({ message: 'No mentor-client relationship' });

    // Read all user_context entries for this student
    const { data: ctx } = await db.from(Tables.USER_CONTEXT).select('key, value').eq('user_id', userId);
    if (!ctx || ctx.length === 0) return res.json(null);

    // Reconstruct the onboarding form data from context entries
    const ctxMap = new Map(ctx.map((r: any) => [r.key, r.value]));
    const profile: Record<string, any> = {};
    if (ctxMap.has('navn')) profile.name = ctxMap.get('navn');
    if (ctxMap.has('alder')) profile.age = Number(ctxMap.get('alder'));
    if (ctxMap.has('kjønn')) {
      const g = ctxMap.get('kjønn');
      profile.gender = g === 'Mann' ? 'male' : g === 'Kvinne' ? 'female' : 'other';
    }
    if (ctxMap.has('nåværende_vekt_kg')) profile.currentWeight = Number(ctxMap.get('nåværende_vekt_kg'));
    if (ctxMap.has('målvekt_kg')) profile.goalWeight = Number(ctxMap.get('målvekt_kg'));
    if (ctxMap.has('høyde_cm')) profile.height = Number(ctxMap.get('høyde_cm'));
    if (ctxMap.has('treningsdager_per_uke')) profile.trainingDaysPerWeek = Number(ctxMap.get('treningsdager_per_uke'));
    if (ctxMap.has('erfaringsnivå')) {
      const e = ctxMap.get('erfaringsnivå');
      profile.experienceLevel = e === 'Nybegynner' ? 'beginner' : e === 'Avansert' ? 'advanced' : 'intermediate';
    }
    if (ctxMap.has('søvn_timer_per_natt')) profile.sleepHoursPerNight = Number(ctxMap.get('søvn_timer_per_natt'));
    if (ctxMap.has('stressnivå')) {
      const s = ctxMap.get('stressnivå');
      profile.stressLevel = s === 'Lavt' ? 'low' : s === 'Høyt' ? 'high' : 'moderate';
    }
    if (ctxMap.has('tilgjengelig_utstyr')) {
      const eq = ctxMap.get('tilgjengelig_utstyr');
      profile.availableEquipment = eq === 'Fullt treningssenter' ? 'full_gym' : eq === 'Kun kroppsvekt' ? 'bodyweight_only' : 'home_basic';
    }
    profile.allergies = ctxMap.has('allergier') ? ctxMap.get('allergier')!.split(', ').filter(Boolean) : [];
    profile.dietaryPreferences = ctxMap.has('kostpreferanser') ? ctxMap.get('kostpreferanser')!.split(', ').filter(Boolean) : [];
    profile.injuries = ctxMap.has('skader') ? ctxMap.get('skader')!.split(', ').filter(Boolean) : [];
    if (ctxMap.has('treningsmål')) {
      const goalLabels: Record<string, string> = {
        'Vektnedgang': 'weight_loss', 'Muskeloppbygging': 'muscle_gain', 'Styrke': 'strength',
        'Generell fitness': 'general_fitness', 'Kroppsrekomposisjon': 'body_recomp',
      };
      profile.primaryGoal = ctxMap.get('treningsmål')!.split(', ').map((g: string) => goalLabels[g] || g);
    } else {
      profile.primaryGoal = [];
    }

    // Ensure all numeric fields have defaults
    profile.age = profile.age || 0;
    profile.currentWeight = profile.currentWeight || 0;
    profile.goalWeight = profile.goalWeight || 0;
    profile.height = profile.height || 0;
    profile.trainingDaysPerWeek = profile.trainingDaysPerWeek || 0;
    profile.sleepHoursPerNight = profile.sleepHoursPerNight || 0;
    profile.experienceLevel = profile.experienceLevel || 'beginner';
    profile.stressLevel = profile.stressLevel || 'moderate';
    profile.availableEquipment = profile.availableEquipment || 'full_gym';
    profile.gender = profile.gender || 'other';
    profile.name = profile.name || '';

    return res.json(profile);
  } catch (err: any) {
    console.error('[student] Failed to read onboarding profile:', err?.message || err);
    return res.status(500).json({ message: 'Failed to load onboarding profile' });
  }
});

// Exercise Progress — /me routes first
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

// ── /me convenience endpoints (resolve userId from auth token) ──

// Log weight via /me/weight (used by frontend chat widgets)
StudentRoutes.post('/me/weight', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const { date: rawDate, kg: rawKg } = req.body || {};
    const date = rawDate || new Date().toISOString().slice(0, 10);
    const kg = Number(rawKg);
    if (!kg || kg < 20 || kg > 500) return res.status(400).json({ message: 'kg must be 20-500' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    const todayIso = new Date().toISOString().slice(0, 10);
    if (date > todayIso) return res.status(400).json({ message: 'date cannot be in the future' });
    await upsert(Tables.WEIGHT_ENTRIES, { user_id: userId, date, kg }, 'user_id,date');
    try {
      await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: "WEIGHT_LOG", summary: `Weight ${kg}kg on ${date}`, actor: userId, after: { date, kg } });
      await publish({ type: "WEIGHT_LOGGED", user: userId, date, kg });
    } catch {}
    return res.status(200).json({ ok: true, date, kg });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to record weight' });
  }
});

// Log meal via /me/meals (used by frontend chat widgets)
StudentRoutes.post('/me/meals', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const { date: rawDate, meal_type, description, total_calories, total_protein_g, total_carbs_g, total_fat_g, items } = req.body || {};
    const date = rawDate || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    const row = await insertOne(Tables.MEAL_LOGS, {
      user_id: userId, date,
      meal_type: meal_type || 'other',
      description: description || '',
      total_calories: Number(total_calories) || 0,
      total_protein_g: Number(total_protein_g) || 0,
      total_carbs_g: Number(total_carbs_g) || 0,
      total_fat_g: Number(total_fat_g) || 0,
      items: items || [],
    });
    return res.status(200).json({ ok: true, id: row?.id });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to log meal' });
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
StudentRoutes.post('/me/workouts', ensureAuth as any, validateZod({ body: WorkoutLogSchema }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const date = (req.body?.date as string) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    await upsert(Tables.WORKOUT_LOGS, { user_id: userId, date, entries }, 'user_id,date');
    await publish({ type: 'WORKOUT_LOGGED', user: userId, date });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to log workout' });
  }
});

// Bulk activity data sync from frontend (periodic sync of localStorage data)
StudentRoutes.post('/me/activity-data', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 30 }), async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const data = req.body || {};
    const today = new Date().toISOString().slice(0, 10);
    let synced = 0;

    // Sync food diary entries as meal_logs (dedup by checking existing count for today)
    if (Array.isArray(data.foodDiaryToday) && data.foodDiaryToday.length > 0) {
      const { count } = await db
        .from(Tables.MEAL_LOGS)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('date', today)
        .eq('source', 'frontend_sync');

      if ((count || 0) === 0) {
        const mealTypeMap: Record<string, string> = {
          'Frokost': 'breakfast', 'Lunsj': 'lunch', 'Middag': 'dinner',
          'Mellommåltid': 'snack', 'Kveldsmat': 'snack',
        };

        for (const entry of data.foodDiaryToday) {
          try {
            await insertOne(Tables.MEAL_LOGS, {
              user_id: userId,
              date: today,
              meal_type: mealTypeMap[entry.mealSection] || 'snack',
              description: entry.name || '',
              total_calories: entry.kcal || 0,
              total_protein_g: entry.protein || 0,
              total_carbs_g: entry.carbs || 0,
              total_fat_g: entry.fat || 0,
              items: [],
              source: 'frontend_sync',
            });
            synced++;
          } catch {}
        }
      }
    }

    // Sync check-in weights to weight_entries
    if (Array.isArray(data.recentCheckIns)) {
      for (const ci of data.recentCheckIns) {
        if (ci.weight && ci.date && /^\d{4}-\d{2}-\d{2}$/.test(ci.date)) {
          try {
            await upsert(Tables.WEIGHT_ENTRIES, {
              user_id: userId,
              date: ci.date,
              kg: Number(ci.weight),
            }, 'user_id,date');
            synced++;
          } catch {}
        }
      }
    }

    // Sync recent workouts to workout_logs
    if (Array.isArray(data.recentWorkouts)) {
      for (const w of data.recentWorkouts) {
        if (w.date && /^\d{4}-\d{2}-\d{2}$/.test(w.date)) {
          try {
            await upsert(Tables.WORKOUT_LOGS, {
              user_id: userId,
              date: w.date,
              entries: [],
            }, 'user_id,date');
            synced++;
          } catch {}
        }
      }
    }

    // Store full activity snapshot as user_context (agent can read this)
    try {
      await upsert(Tables.USER_CONTEXT, {
        user_id: userId,
        key: 'latest_activity_sync',
        value: JSON.stringify({
          habits: data.habits,
          goals: data.goals,
          tasks: data.tasks,
          stepsToday: data.stepsToday,
          shoppingList: data.shoppingList,
          timestamp: data.timestamp || new Date().toISOString(),
        }),
        source: 'frontend_sync',
        updated_at: new Date().toISOString(),
      }, 'user_id,key');
      synced++;
    } catch {}

    return res.json({ ok: true, synced });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to sync activity data' });
  }
});

export default StudentRoutes;
