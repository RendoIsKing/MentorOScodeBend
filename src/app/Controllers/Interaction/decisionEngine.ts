import { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import { TrainingPlan, NutritionPlan, Goal } from '../../Models/PlanModels';
import ChangeEvent from '../../../models/ChangeEvent';
import { publish } from '../../../services/events/publish';
import { UserProfile } from '../../Models/UserProfile';
import * as Sentry from '@sentry/node';

function toTitle(str: string) {
  return str
    .toLowerCase()
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());
}

export const decideAndApplyAction = async (req: Request, res: Response) => {
  try {
    // Resolve user id from req.user, body, or auth_token cookie
    let userId: any = (req as any).user?._id || req.body.userId;
    if (!userId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.JWT_SECRET || 'secret_secret';
          const decoded: any = jwt.verify(token, secret);
          userId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    const MessageSchema = z.object({ message: z.string().trim().min(1).max(2000) });
    const parsed = MessageSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ message: 'validation_failed', details: parsed.error.flatten() });
    const message = String(parsed.data.message || '');
    if (!userId || !Types.ObjectId.isValid(userId)) {
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
      const current = await TrainingPlan.findOne({ userId, isCurrent: true }).sort({ version: -1 });
      const nextVersion = (current?.version || 0) + 1;
      await TrainingPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
      const created = await TrainingPlan.create({ userId, version: nextVersion, isCurrent: true, sessions });
      try { await ChangeEvent.create({ user: userId as any, type: 'PLAN_EDIT', summary: `Generated plan for ${days} days/week`, actor: (req as any)?.user?._id, before: { fromVersion: current?.version }, after: { toVersion: nextVersion } }); } catch {}
      try { await publish({ type: 'PLAN_UPDATED', user: userId as any }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(created._id) }], summary: `Ny treningsplan (${days} dager/uke) er lagt til Assets` });
    }

    // 0) Generate plans on demand: "lag treningsplan" / "ny treningsplan" / "lag kostholdsplan"
    // Add to assets (implicit plan) or explicit new training plan
    if (
      // explicit intent (lag/ny)
      ((/\blag\b|\bny\b/).test(lower) && /treningsplan/.test(lower)) ||
      // colloquial: "legg til i treningsplan(er)"
      (/(legg|legge)\s+til.*treningsplan(er)?/.test(lower)) ||
      // english
      ((/add/).test(lower) && /training\s*plan/.test(lower)) ||
      // mention assets with create verbs
      ((/\blag\b|\bny\b|\blegg\b|\blegge\b|\badd\b/).test(lower) && /assets/.test(lower))
    ) {
      const profile = await UserProfile.findOne({ userId }).lean();
      // try to infer number of days from message, including patterns like "4-dagers"
      const inferred = lower.match(/(\d)[- ]?dagers|trene\s+(\d)\s+(?:ganger|dager)/);
      const inferDays = inferred ? Number(inferred[1] || inferred[2]) : undefined;
      const days = inferDays || profile?.trainingDaysPerWeek || 4;
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
      const current = await TrainingPlan.findOne({ userId, isCurrent: true }).sort({ version: -1 });
      const nextVersion = (current?.version || 0) + 1;
      await TrainingPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
      const created = await TrainingPlan.create({ userId, version: nextVersion, isCurrent: true, sessions });
      try { await ChangeEvent.create({ user: userId as any, type: 'PLAN_EDIT', summary: 'Generated new training plan', actor: (req as any)?.user?._id, before: { fromVersion: current?.version }, after: { toVersion: nextVersion } }); } catch {}
      try { await publish({ type: 'PLAN_UPDATED', user: userId as any }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(created._id) }], summary: 'Ny treningsplan er lagt til Assets' });
    }
    if ((/\blag\b|\bny\b/).test(lower) && /(kostholdsplan|måltidsplan|meal)/.test(lower)) {
      const profile = await UserProfile.findOne({ userId }).lean();
      const weight = profile?.currentWeightKg || 80;
      const kcal = Math.round(weight * 30);
      const protein = Math.round(weight * 2.0);
      const carbs = Math.round((kcal * 0.5) / 4);
      const fat = Math.round((kcal * 0.25) / 9);
      const current = await NutritionPlan.findOne({ userId, isCurrent: true }).sort({ version: -1 });
      const nextVersion = (current?.version || 0) + 1;
      await NutritionPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
      const created = await NutritionPlan.create({ userId, version: nextVersion, isCurrent: true, dailyTargets: { kcal, protein, carbs, fat }, notes: profile?.nutritionPreferences || '' });
      try { await ChangeEvent.create({ user: userId as any, type: 'NUTRITION_EDIT', summary: 'Generated new nutrition plan', actor: (req as any)?.user?._id, before: { fromVersion: current?.version }, after: { toVersion: nextVersion } }); } catch {}
      try { await publish({ type: 'NUTRITION_UPDATED', user: userId as any }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'nutrition', planId: String(created._id) }], summary: 'Ny kostholdsplan er lagt til Assets' });
    }

    // 1) Swap exercise: "bytt [old] til [new]"
    const swapMatch = lower.match(/bytt\s+([^\n]+?)\s+til\s+([^\n]+)$/);
    if (swapMatch) {
      const oldName = toTitle(swapMatch[1].trim());
      const newName = toTitle(swapMatch[2].trim());
      const current = await TrainingPlan.findOne({ userId, isCurrent: true }).sort({ version: -1 });
      if (!current) return res.json({ noAction: true, info: 'No current training plan' });

      const nextVersion = (current.version || 0) + 1;
      const sessions = (current.sessions || []).map((s: any) => ({
        ...s,
        exercises: (s.exercises || []).map((e: any) => ({
          ...e,
          name: e.name?.toLowerCase() === oldName.toLowerCase() ? newName : e.name,
        })),
      }));
      await TrainingPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
      const created = await TrainingPlan.create({ userId, version: nextVersion, isCurrent: true, sessions });
      try { await ChangeEvent.create({ user: userId as any, type: 'PLAN_EDIT', summary: `Swapped ${oldName} to ${newName}`, actor: (req as any)?.user?._id, before: { fromVersion: current.version }, after: { toVersion: nextVersion } }); } catch {}
      try { await publish({ type: 'PLAN_UPDATED', user: userId as any }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(created._id) }], summary: `Byttet ${oldName} til ${newName}` });
    }

    // 2) Set calories: "sett kalorier til 2400" / "sett kcal til 2200"
    const kcalSet = lower.match(/sett\s+(?:kalorier|kcal)\s+til\s+(\d{3,4})/);
    if (kcalSet) {
      const kcal = Number(kcalSet[1]);
      const current = await NutritionPlan.findOne({ userId, isCurrent: true }).sort({ version: -1 });
      const nextVersion = (current?.version || 0) + 1;
      const base = current?.dailyTargets || { kcal, protein: Math.round(kcal*0.3/4), carbs: Math.round(kcal*0.5/4), fat: Math.round(kcal*0.2/9) };
      const ratio = { p: (base.protein*4)/base.kcal, c: (base.carbs*4)/base.kcal, f: (base.fat*9)/base.kcal };
      const protein = Math.round((kcal * ratio.p) / 4);
      const carbs = Math.round((kcal * ratio.c) / 4);
      const fat = Math.round((kcal * ratio.f) / 9);
      await NutritionPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
      const created = await NutritionPlan.create({ userId, version: nextVersion, isCurrent: true, dailyTargets: { kcal, protein, carbs, fat }, notes: current?.notes || '' });
      try { await ChangeEvent.create({ user: userId as any, type: 'NUTRITION_EDIT', summary: `Set calories to ${kcal}`, actor: (req as any)?.user?._id, before: { fromVersion: current?.version }, after: { toVersion: nextVersion, kcal } }); } catch {}
      try { await publish({ type: 'NUTRITION_UPDATED', user: userId as any }); } catch {}
      return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'nutrition', planId: String(created._id) }], summary: `Kalorier satt til ${kcal}` });
    }

    // 3) Update goal: "sett vektmål til 75kg"
    const goalSet = lower.match(/sett\s+(?:vektmål|mål)\s+til\s+(\d{2,3})\s*kg?/);
    if (goalSet) {
      const target = Number(goalSet[1]);
      const current = await Goal.findOne({ userId, isCurrent: true }).sort({ version: -1 });
      const nextVersion = (current?.version || 0) + 1;
      await Goal.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
      const created = await Goal.create({ userId, version: nextVersion, isCurrent: true, targetWeightKg: target, strengthTargets: current?.strengthTargets || '', horizonWeeks: current?.horizonWeeks || 8 });
      try { await ChangeEvent.create({ user: userId as any, type: 'PLAN_EDIT', summary: `Updated target weight to ${target}kg`, actor: (req as any)?.user?._id, before: { fromVersion: current?.version }, after: { toVersion: nextVersion, target } }); } catch {}
      return res.json({ actions: [{ type: 'GOAL_SET', goalId: String(created._id) }], summary: `Vektmål oppdatert til ${target}kg` });
    }

    return res.json({ noAction: true });
  } catch (e) {
    console.error('decideAndApplyAction error', e);
    return res.status(500).json({ message: 'action failed' });
  }
};


