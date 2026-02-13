import { Request, Response } from 'express';
import { z } from 'zod';
import { db, findOne, insertOne, updateMany, Tables } from '../../../lib/db';
import { publish } from '../../../services/events/publish';
import * as Sentry from '@sentry/node';

function toTitle(str: string) {
  return str
    .toLowerCase()
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());
}

/** Get current plan (highest version) for a user */
async function getCurrentTrainingPlan(userId: string) {
  const { data } = await db
    .from(Tables.TRAINING_PLANS)
    .select('*')
    .eq('user_id', userId)
    .eq('is_current', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getCurrentNutritionPlan(userId: string) {
  const { data } = await db
    .from(Tables.NUTRITION_PLANS)
    .select('*')
    .eq('user_id', userId)
    .eq('is_current', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getCurrentGoal(userId: string) {
  const { data } = await db
    .from(Tables.GOALS)
    .select('*')
    .eq('user_id', userId)
    .eq('is_current', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export const decideAndApplyAction = async (req: Request, res: Response) => {
  try {
    const userId: any = (req as any).user?._id || (req as any).user?.id || req.body.userId;
    const MessageSchema = z.object({ message: z.string().trim().min(1).max(2000) });
    const parsed = MessageSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const message = String(parsed.data.message || '');
    if (!userId) {
      return res.status(400).json({ message: 'userId required' });
    }

    const lower = message.toLowerCase();

    // Heuristic: user states training availability (e.g., "kan trene 4 ganger i uken")
    const avail = lower.match(/trene\s+(\d)\s+(?:ganger|dager)/);
    try { Sentry.addBreadcrumb({ category: 'plan', message: 'decideAndApplyAction', data: { userId: String(userId), message: message.slice(0,200) } }); } catch {}
    if (avail) {
      const days = Number(avail[1]);
      const focuses = ['Overkropp','Underkropp','Fullkropp','Push','Pull','Legs'];
      const sessions = Array.from({ length: days }).map((_, i) => ({
        day: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i % 7],
        focus: focuses[i % focuses.length],
        exercises: [
          { name: 'Benkpress', sets: 4, reps: 8 },
          { name: 'Knebøy', sets: 4, reps: 8 },
          { name: 'Roing', sets: 4, reps: 10 },
        ],
      }));
      const current = await getCurrentTrainingPlan(userId);
      const nextVersion = (current?.version ?? 0) + 1;
      await updateMany(Tables.TRAINING_PLANS, { user_id: userId, is_current: true }, { is_current: false });
      const created = await insertOne(Tables.TRAINING_PLANS, { user_id: userId, version: nextVersion, is_current: true, sessions });
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'PLAN_EDIT', summary: `Generated plan for ${days} days/week`, actor: (req as any)?.user?._id || (req as any)?.user?.id ? { id: (req as any).user?._id || (req as any).user?.id } : null, before_data: { fromVersion: current?.version }, after_data: { toVersion: nextVersion } }); } catch {}
      try { await publish({ type: 'PLAN_UPDATED', user: userId }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(created?.id) }], summary: `Ny treningsplan (${days} dager/uke) er lagt til Assets` });
    }

    // 0) Generate plans on demand: "lag treningsplan" / "ny treningsplan" / "lag kostholdsplan"
    if (
      ((/\blag\b|\bny\b/).test(lower) && /treningsplan/.test(lower)) ||
      (/(legg|legge)\s+til.*treningsplan(er)?/.test(lower)) ||
      ((/add/).test(lower) && /training\s*plan/.test(lower)) ||
      ((/\blag\b|\bny\b|\blegg\b|\blegge\b|\badd\b/).test(lower) && /assets/.test(lower))
    ) {
      const profile = await findOne(Tables.USER_PROFILES, { user_id: userId });
      const inferred = lower.match(/(\d)[- ]?dagers|trene\s+(\d)\s+(?:ganger|dager)/);
      const inferDays = inferred ? Number(inferred[1] || inferred[2]) : undefined;
      const days = inferDays ?? profile?.training_days_per_week ?? 4;
      const focuses = ['Overkropp','Underkropp','Fullkropp','Push','Pull','Legs'];
      const sessions = Array.from({ length: days }).map((_, i) => ({
        day: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i % 7],
        focus: focuses[i % focuses.length],
        exercises: [
          { name: 'Benkpress', sets: 3, reps: 8 },
          { name: 'Knebøy', sets: 3, reps: 8 },
          { name: 'Roing', sets: 3, reps: 10 },
        ],
      }));
      const current = await getCurrentTrainingPlan(userId);
      const nextVersion = (current?.version ?? 0) + 1;
      await updateMany(Tables.TRAINING_PLANS, { user_id: userId, is_current: true }, { is_current: false });
      const created = await insertOne(Tables.TRAINING_PLANS, { user_id: userId, version: nextVersion, is_current: true, sessions });
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'PLAN_EDIT', summary: 'Generated new training plan', actor: (req as any)?.user?._id || (req as any)?.user?.id ? { id: (req as any).user?._id || (req as any).user?.id } : null, before_data: { fromVersion: current?.version }, after_data: { toVersion: nextVersion } }); } catch {}
      try { await publish({ type: 'PLAN_UPDATED', user: userId }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(created?.id) }], summary: 'Ny treningsplan er lagt til Assets' });
    }
    if ((/\blag\b|\bny\b/).test(lower) && /(kostholdsplan|måltidsplan|meal)/.test(lower)) {
      const profile = await findOne(Tables.USER_PROFILES, { user_id: userId });
      const weight = profile?.current_weight_kg ?? 80;
      const kcal = Math.round(weight * 30);
      const protein = Math.round(weight * 2.0);
      const carbs = Math.round((kcal * 0.5) / 4);
      const fat = Math.round((kcal * 0.25) / 9);
      const current = await getCurrentNutritionPlan(userId);
      const nextVersion = (current?.version ?? 0) + 1;
      await updateMany(Tables.NUTRITION_PLANS, { user_id: userId, is_current: true }, { is_current: false });
      const created = await insertOne(Tables.NUTRITION_PLANS, { user_id: userId, version: nextVersion, is_current: true, daily_targets: { kcal, protein, carbs, fat }, notes: profile?.nutrition_preferences || '' });
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'NUTRITION_EDIT', summary: 'Generated new nutrition plan', actor: (req as any)?.user?._id || (req as any)?.user?.id ? { id: (req as any).user?._id || (req as any).user?.id } : null, before_data: { fromVersion: current?.version }, after_data: { toVersion: nextVersion } }); } catch {}
      try { await publish({ type: 'NUTRITION_UPDATED', user: userId }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'nutrition', planId: String(created?.id) }], summary: 'Ny kostholdsplan er lagt til Assets' });
    }

    // 1) Swap exercise: "bytt [old] til [new]"
    const swapMatch = lower.match(/bytt\s+([^\n]+?)\s+til\s+([^\n]+)$/);
    if (swapMatch) {
      const oldName = toTitle(swapMatch[1].trim());
      const newName = toTitle(swapMatch[2].trim());
      const current = await getCurrentTrainingPlan(userId);
      if (!current) return res.json({ noAction: true, info: 'No current training plan' });

      const nextVersion = (current.version ?? 0) + 1;
      const sessions = ((current.sessions as any[]) || []).map((s: any) => ({
        ...s,
        exercises: (s.exercises || []).map((e: any) => ({
          ...e,
          name: e.name?.toLowerCase() === oldName.toLowerCase() ? newName : e.name,
        })),
      }));
      await updateMany(Tables.TRAINING_PLANS, { user_id: userId, is_current: true }, { is_current: false });
      const created = await insertOne(Tables.TRAINING_PLANS, { user_id: userId, version: nextVersion, is_current: true, sessions });
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'PLAN_EDIT', summary: `Swapped ${oldName} to ${newName}`, actor: (req as any)?.user?._id || (req as any)?.user?.id ? { id: (req as any).user?._id || (req as any).user?.id } : null, before_data: { fromVersion: current.version }, after_data: { toVersion: nextVersion } }); } catch {}
      try { await publish({ type: 'PLAN_UPDATED', user: userId }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(created?.id) }], summary: `Byttet ${oldName} til ${newName}` });
    }

    // 2) Set calories: "sett kalorier til 2400" / "sett kcal til 2200"
    const kcalSet = lower.match(/sett\s+(?:kalorier|kcal)\s+til\s+(\d{3,4})/);
    if (kcalSet) {
      const kcal = Number(kcalSet[1]);
      const current = await getCurrentNutritionPlan(userId);
      const nextVersion = (current?.version ?? 0) + 1;
      const base = current?.daily_targets || { kcal, protein: Math.round(kcal*0.3/4), carbs: Math.round(kcal*0.5/4), fat: Math.round(kcal*0.2/9) };
      const ratio = { p: (base.protein*4)/base.kcal, c: (base.carbs*4)/base.kcal, f: (base.fat*9)/base.kcal };
      const protein = Math.round((kcal * ratio.p) / 4);
      const carbs = Math.round((kcal * ratio.c) / 4);
      const fat = Math.round((kcal * ratio.f) / 9);
      await updateMany(Tables.NUTRITION_PLANS, { user_id: userId, is_current: true }, { is_current: false });
      const created = await insertOne(Tables.NUTRITION_PLANS, { user_id: userId, version: nextVersion, is_current: true, daily_targets: { kcal, protein, carbs, fat }, notes: current?.notes || '' });
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'NUTRITION_EDIT', summary: `Set calories to ${kcal}`, actor: (req as any)?.user?._id || (req as any)?.user?.id ? { id: (req as any).user?._id || (req as any).user?.id } : null, before_data: { fromVersion: current?.version }, after_data: { toVersion: nextVersion, kcal } }); } catch {}
      try { await publish({ type: 'NUTRITION_UPDATED', user: userId }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'nutrition', planId: String(created?.id) }], summary: `Kalorier satt til ${kcal}` });
    }

    // 3) Update goal: "sett vektmål til 75kg"
    const goalSet = lower.match(/sett\s+(?:vektmål|mål)\s+til\s+(\d{2,3})\s*kg?/);
    if (goalSet) {
      const target = Number(goalSet[1]);
      const current = await getCurrentGoal(userId);
      const nextVersion = (current?.version ?? 0) + 1;
      await updateMany(Tables.GOALS, { user_id: userId, is_current: true }, { is_current: false });
      const created = await insertOne(Tables.GOALS, { user_id: userId, version: nextVersion, is_current: true, target_weight_kg: target, strength_targets: current?.strength_targets || '', horizon_weeks: current?.horizon_weeks ?? 8 });
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'GOAL_EDIT', summary: `Updated target weight to ${target}kg`, actor: (req as any)?.user?._id || (req as any)?.user?.id ? { id: (req as any).user?._id || (req as any).user?.id } : null, before_data: { fromVersion: current?.version }, after_data: { toVersion: nextVersion, target } }); } catch {}
      return res.json({ actions: [{ type: 'GOAL_SET', goalId: String(created?.id) }], summary: `Vektmål oppdatert til ${target}kg` });
    }

    return res.json({ noAction: true });
  } catch (e) {
    console.error('decideAndApplyAction error', e);
    return res.status(500).json({ message: 'action failed' });
  }
};
