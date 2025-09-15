import { Router } from "express";
import { InteractionController } from "../app/Controllers/Interaction";
import { chatWithCoachEngh } from "../app/Controllers/Interaction/chat.controller";
import { generateFirstPlans } from "../app/Controllers/Interaction/generateFirstPlans";
import { decideAndApplyAction } from "../app/Controllers/Interaction/decisionEngine";
import { Goal, TrainingPlan, NutritionPlan } from "../app/Models/PlanModels";
import TrainingPlanVersion from "../models/TrainingPlanVersion";
import NutritionPlanVersion from "../models/NutritionPlanVersion";
import StudentState from "../models/StudentState";
import ChangeEvent from "../models/ChangeEvent";
import { nextTrainingVersion, nextNutritionVersion } from "../services/versioning/nextVersion";
import { publish } from "../services/events/publish";
import { patchSwapExercise, patchSetDaysPerWeek } from "../services/planRules/training";
import { applyTrainingPatch, applyNutritionPatch } from "../services/planRules/materialize";
import jwt from 'jsonwebtoken';
import { UserProfile } from '../app/Models/UserProfile';
import { createMulterInstance } from '../app/Middlewares/fileUpload';
import { FileEnum } from '../types/FileEnum';
import { CoachKnowledge } from '../app/Models/CoachKnowledge';
import path from 'path';
import { getThread, appendMessage, clearThread } from '../app/Controllers/Interaction/thread.controller';

const knowledgeUpload = createMulterInstance(`${process.cwd()}${FileEnum.PUBLICDIR}/coach-knowledge`);
import { Auth } from "../app/Middlewares";

const InteractionRoutes: Router = Router();

InteractionRoutes.post(
  "/toggle-like/:id",
  Auth,
  InteractionController.toggleLike
);
InteractionRoutes.post("/comment/:id", Auth, InteractionController.postComment);
InteractionRoutes.delete(
  "/comment/:id",
  Auth,
  InteractionController.softDeleteComment
);
InteractionRoutes.post(
  "/toggle-saved/:id",
  Auth,
  InteractionController.togglePost
);
InteractionRoutes.post(
  "/reply-comment/:id",
  Auth,
  InteractionController.addNestedComment
);
InteractionRoutes.get(
  "/comments/:id",
  Auth,
  InteractionController.getCommentsByPostId
);
InteractionRoutes.post(
  "/like-comment/:id",
  Auth,
  InteractionController.likeAComment
);
InteractionRoutes.post(
  "/like-story/:id",
  Auth,
  InteractionController.toggleLikeStoryAction
);
InteractionRoutes.post(
  "/impressions",
  Auth,
  InteractionController.createImpression
);
InteractionRoutes.post("/log-view", Auth, InteractionController.logView);

// New route for Coach Engh chat
InteractionRoutes.post("/chat/engh", chatWithCoachEngh);
InteractionRoutes.post('/chat/engh/plans/generate-first', generateFirstPlans);
// Open endpoint publicly (no Auth) to make it easy to call from chat UI
InteractionRoutes.post('/chat/engh/action', decideAndApplyAction);
// Unified actions endpoint (rules engine)
type ActionBody = { type: string; payload?: any; userId?: string };
function validateActionBody(body: any, userId: string): { ok: true; data: ActionBody } | { ok: false; error: any }{
  const allowed = ['PLAN_SWAP_EXERCISE','PLAN_SET_DAYS_PER_WEEK','NUTRITION_SET_CALORIES','WEIGHT_LOG','WEIGHT_DELETE'];
  const type = String((body||{}).type || '');
  if (!allowed.includes(type)) return { ok: false, error: { message: 'invalid type' } } as const;
  const payload = (body||{}).payload;
  if (payload != null && typeof payload !== 'object') return { ok: false, error: { message: 'payload must be object' } } as const;
  return { ok: true, data: { type, payload, userId } } as const;
}
InteractionRoutes.post('/interaction/actions/apply', async (req, res) => {
  try {
    let userId: any = (req as any).user?._id || req.body.userId || (req as any).session?.user?.id;
    if (!userId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.JWT_SECRET || 'secret_secret';
          const decoded: any = (await import('jsonwebtoken')).default.verify(token, secret);
          userId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    if (!userId) {
      // Dev fallback: if running with dev routes enabled and no session cookie was forwarded
      try {
        const enabled = String(process.env.DEV_LOGIN_ENABLED || '').trim().toLowerCase();
        if (enabled === 'true' || (process.env.NODE_ENV !== 'production')) {
          const { User } = await import('../app/Models/User');
          const demo = await (User as any).findOne({ email: 'demo@mentoros.app' }).lean();
          if (demo?._id) userId = String(demo._id);
        }
      } catch {}
    }
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const validated = validateActionBody(req.body, typeof userId==='string'?userId: String(userId||''));
    if (!validated.ok) return res.status(400).json({ error: 'Invalid payload', details: validated.error });
    const { type, payload } = validated.data as any;

    // Safety rails
    const MIN_KCAL = 1200;
    const MAX_KCAL = 5000;
    const MAX_VOL_JUMP = 0.20; // 20%

    if (type === 'NUTRITION_SET_CALORIES') {
      const kcal = Number(payload?.kcal);
      if (!Number.isFinite(kcal)) return res.status(400).json({ error: 'kcal required' });
      if (kcal < MIN_KCAL || kcal > MAX_KCAL) return res.status(422).json({ error: `kcal must be between ${MIN_KCAL} and ${MAX_KCAL}` });
    }
    // Read current versions via StudentState pointers
    const StudentState = (await import('../models/StudentState')).default;
    const TrainingPlanVersion = (await import('../models/TrainingPlanVersion')).default;
    const state = await StudentState.findOne({ user: userId });
    const currentTraining = state?.currentTrainingPlanVersion ? await TrainingPlanVersion.findById(state.currentTrainingPlanVersion) : null;

    if (type === 'PLAN_SWAP_EXERCISE') {
      if (!currentTraining) return res.status(404).json({ error: 'No current training plan' });
      const patch = patchSwapExercise(currentTraining.days as any, payload?.day || 'Mon', payload?.from, payload?.to);
      const ret = await applyTrainingPatch(userId, currentTraining, patch);
      return res.json({ ok: true, summary: patch.reason.summary, ...ret });
    }
    if (type === 'PLAN_SET_DAYS_PER_WEEK') {
      if (!currentTraining) return res.status(404).json({ error: 'No current training plan' });
      const nextDays = Number(payload?.daysPerWeek || 3);
      if (!Number.isFinite(nextDays) || nextDays < 1 || nextDays > 7) return res.status(422).json({ error: 'daysPerWeek must be 1–7' });
      try {
        const currentDays = Array.isArray((currentTraining as any).days)
          ? ((currentTraining as any).days.filter((d:any)=> (d.exercises||[]).length>0).length || (currentTraining as any).days.length || 0)
          : 0;
        if (currentDays && nextDays > Math.ceil(currentDays * (1 + MAX_VOL_JUMP))) {
          return res.status(422).json({ error: 'volume jump >20% blocked. Increase gradually.' });
        }
      } catch {}
      const patch = patchSetDaysPerWeek(currentTraining.days as any, nextDays);
      const ret = await applyTrainingPatch(userId, currentTraining, patch);
      return res.json({ ok: true, summary: patch.reason.summary, ...ret });
    }
    if (type === 'NUTRITION_SET_CALORIES') {
      const kcal = Number(payload?.kcal);
      const ret = await applyNutritionPatch(userId, { kcal, reason: { summary: `Kalorier satt til ${kcal}` } } as any);
      try { await ChangeEvent.create({ user: userId, type: 'NUTRITION_EDIT', summary: `Satte kalorier: ${kcal} kcal` }); } catch {}
      return res.json({ ok: true, summary: `Kalorier satt til ${kcal}`, ...ret });
    }
    if (type === 'WEIGHT_LOG') {
      const { date, kg } = payload || {};
      const { WeightEntry } = await import('../app/Models/WeightEntry');
      await WeightEntry.updateOne({ userId, date }, { $set: { kg } }, { upsert: true });
      try { const ChangeEvent = (await import('../models/ChangeEvent')).default; await ChangeEvent.create({ user: userId, type: 'WEIGHT_LOG', summary: `Logget vekt: ${kg} kg (${date})` }); } catch {}
      await publish({ type: 'WEIGHT_LOGGED', user: userId, date, kg });
      return res.json({ ok: true, summary: `Vekt ${kg}kg lagret` });
    }
    if (type === 'WEIGHT_DELETE') {
      const { date } = payload || {};
      const { WeightEntry } = await import('../app/Models/WeightEntry');
      await WeightEntry.deleteOne({ userId, date });
      try { const ChangeEvent = (await import('../models/ChangeEvent')).default; await ChangeEvent.create({ user: userId, type: 'WEIGHT_LOG', summary: `Weight entry deleted for ${date}` }); } catch {}
      await publish({ type: 'WEIGHT_DELETED', user: userId as any, date });
      return res.json({ ok: true, summary: `Vekt slettet (${date})` });
    }
    return res.status(400).json({ error: 'Unknown action type' });
  } catch (e) {
    return res.status(500).json({ error: 'Action apply failed' });
  }
});

// Alias without the extra "/interaction" segment so final path is
// /api/backend/v1/interaction/actions/apply (expected by FE/tests)
InteractionRoutes.post('/actions/apply', async (req, res) => {
  try {
    let userId: any = (req as any).user?._id || req.body.userId;
    if (!userId) {
      const cookie = req.headers?.cookie as string | undefined;
      const match = cookie?.match(/auth_token=([^;]+)/);
      if (match) {
        try {
          const token = decodeURIComponent(match[1]);
          const secret = process.env.JWT_SECRET || 'secret_secret';
          const decoded: any = (await import('jsonwebtoken')).default.verify(token, secret);
          userId = decoded?.id || decoded?._id;
        } catch {}
      }
    }
    if (!userId) {
      // Dev fallback: if running with dev routes enabled and no session cookie was forwarded
      try {
        const enabled = String(process.env.DEV_LOGIN_ENABLED || '').trim().toLowerCase();
        if (enabled === 'true' || (process.env.NODE_ENV !== 'production')) {
          const { User } = await import('../app/Models/User');
          const demo = await (User as any).findOne({ email: 'demo@mentoros.app' }).lean();
          if (demo?._id) userId = String(demo._id);
        }
      } catch {}
    }
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const validated = validateActionBody(req.body, typeof userId==='string'?userId: String(userId||''));
    if (!validated.ok) return res.status(400).json({ error: 'Invalid payload', details: validated.error });
    const { type, payload } = validated.data as any;

    const MIN_KCAL = 1200;
    const MAX_KCAL = 5000;
    const MAX_VOL_JUMP = 0.20;

    if (type === 'NUTRITION_SET_CALORIES') {
      const kcal = Number(payload?.kcal);
      if (!Number.isFinite(kcal)) return res.status(400).json({ error: 'kcal required' });
      if (kcal < MIN_KCAL || kcal > MAX_KCAL) return res.status(422).json({ error: `kcal must be between ${MIN_KCAL} and ${MAX_KCAL}` });
    }
    const StudentState = (await import('../models/StudentState')).default;
    const TrainingPlanVersion = (await import('../models/TrainingPlanVersion')).default;
    const state = await StudentState.findOne({ user: userId });
    const currentTraining = state?.currentTrainingPlanVersion ? await TrainingPlanVersion.findById(state.currentTrainingPlanVersion) : null;

    if (type === 'PLAN_SWAP_EXERCISE') {
      if (!currentTraining) return res.status(404).json({ error: 'No current training plan' });
      const patch = patchSwapExercise(currentTraining.days as any, payload?.day || 'Mon', payload?.from, payload?.to);
      const ret = await applyTrainingPatch(userId, currentTraining, patch);
      return res.json({ ok: true, summary: patch.reason.summary, ...ret });
    }
    if (type === 'PLAN_SET_DAYS_PER_WEEK') {
      if (!currentTraining) return res.status(404).json({ error: 'No current training plan' });
      const nextDays = Number(payload?.daysPerWeek || 3);
      if (!Number.isFinite(nextDays) || nextDays < 1 || nextDays > 7) return res.status(422).json({ error: 'daysPerWeek must be 1–7' });
      try {
        const currentDays = Array.isArray((currentTraining as any).days)
          ? ((currentTraining as any).days.filter((d:any)=> (d.exercises||[]).length>0).length || (currentTraining as any).days.length || 0)
          : 0;
        if (currentDays && nextDays > Math.ceil(currentDays * (1 + MAX_VOL_JUMP))) {
          return res.status(422).json({ error: 'volume jump >20% blocked. Increase gradually.' });
        }
      } catch {}
      const patch = patchSetDaysPerWeek(currentTraining.days as any, nextDays);
      const ret = await applyTrainingPatch(userId, currentTraining, patch);
      return res.json({ ok: true, summary: patch.reason.summary, ...ret });
    }
    if (type === 'NUTRITION_SET_CALORIES') {
      const kcal = Number(payload?.kcal);
      const ret = await applyNutritionPatch(userId, { kcal, reason: { summary: `Kalorier satt til ${kcal}` } } as any);
      try { await ChangeEvent.create({ user: userId, type: 'NUTRITION_EDIT', summary: `Satte kalorier: ${kcal} kcal` }); } catch {}
      return res.json({ ok: true, summary: `Kalorier satt til ${kcal}`, ...ret });
    }
    if (type === 'WEIGHT_LOG') {
      const { date, kg } = payload || {};
      const { WeightEntry } = await import('../app/Models/WeightEntry');
      await WeightEntry.updateOne({ userId, date }, { $set: { kg } }, { upsert: true });
      try { const ChangeEvent = (await import('../models/ChangeEvent')).default; await ChangeEvent.create({ user: userId, type: 'WEIGHT_LOG', summary: `Logget vekt: ${kg} kg (${date})` }); } catch {}
      await publish({ type: 'WEIGHT_LOGGED', user: userId, date, kg });
      return res.json({ ok: true, summary: `Vekt ${kg}kg lagret` });
    }
    if (type === 'WEIGHT_DELETE') {
      const { date } = payload || {};
      const { WeightEntry } = await import('../app/Models/WeightEntry');
      await WeightEntry.deleteOne({ userId, date });
      try { const ChangeEvent = (await import('../models/ChangeEvent')).default; await ChangeEvent.create({ user: userId, type: 'WEIGHT_LOG', summary: `Weight entry deleted for ${date}` }); } catch {}
      await publish({ type: 'WEIGHT_DELETED', user: userId as any, date });
      return res.json({ ok: true, summary: `Vekt slettet (${date})` });
    }
    return res.status(400).json({ error: 'Unknown action type' });
  } catch (e) {
    return res.status(500).json({ error: 'Action apply failed' });
  }
});
// Thread persistence
InteractionRoutes.get('/chat/engh/thread', getThread);
InteractionRoutes.post('/chat/engh/message', appendMessage);
InteractionRoutes.post('/chat/engh/clear', clearThread);

// Get current goal for user
InteractionRoutes.get('/chat/engh/goals/current', async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req.query.userId as string) || ((): string | undefined => {
      const cookie = req.headers?.cookie as string | undefined;
      if (!cookie) return undefined;
      const match = cookie.match(/auth_token=([^;]+)/);
      if (!match) return undefined;
      try {
        const token = decodeURIComponent(match[1]);
        const secret = process.env.JWT_SECRET || 'secret_secret';
        const decoded: any = jwt.verify(token, secret);
        return decoded?.id || decoded?._id;
      } catch { return undefined; }
    })();
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const goal = await Goal.findOne({ userId, isCurrent: true }).sort({ version: -1 }).lean();
    if (!goal) return res.status(404).json({ message: 'not found' });
    res.json({ data: goal });
  } catch (e) {
    res.status(500).json({ message: 'goal fetch failed' });
  }
});

// Get current training plan for user (mirrors goals/current behavior)
InteractionRoutes.get('/chat/engh/training/current', async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req.query.userId as string) || ((): string | undefined => {
      const cookie = req.headers?.cookie as string | undefined;
      if (!cookie) return undefined;
      const match = cookie.match(/auth_token=([^;]+)/);
      if (!match) return undefined;
      try {
        const token = decodeURIComponent(match[1]);
        const secret = process.env.JWT_SECRET || 'secret_secret';
        const decoded: any = jwt.verify(token, secret);
        return decoded?.id || decoded?._id;
      } catch { return undefined; }
    })();
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const plan = await TrainingPlan.findOne({ userId, isCurrent: true }).sort({ version: -1 }).lean();
    if (!plan) return res.status(404).json({ message: 'not found' });
    res.json({ data: plan });
  } catch (e) {
    res.status(500).json({ message: 'training fetch failed' });
  }
});

// Get current nutrition plan for user
InteractionRoutes.get('/chat/engh/nutrition/current', async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req.query.userId as string) || ((): string | undefined => {
      const cookie = req.headers?.cookie as string | undefined;
      if (!cookie) return undefined;
      const match = cookie.match(/auth_token=([^;]+)/);
      if (!match) return undefined;
      try {
        const token = decodeURIComponent(match[1]);
        const secret = process.env.JWT_SECRET || 'secret_secret';
        const decoded: any = jwt.verify(token, secret);
        return decoded?.id || decoded?._id;
      } catch { return undefined; }
    })();
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const plan = await NutritionPlan.findOne({ userId, isCurrent: true }).sort({ version: -1 }).lean();
    if (!plan) return res.status(404).json({ message: 'not found' });
    res.json({ data: plan });
  } catch (e) {
    res.status(500).json({ message: 'nutrition fetch failed' });
  }
});

// Upload coach knowledge files (for now, tied to Coach Engh; later use coachId param)
InteractionRoutes.post('/chat/engh/knowledge/upload', knowledgeUpload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'file is required' });
    const doc = await CoachKnowledge.create({
      coachId: (req as any).user?._id || undefined,
      title: file.originalname,
      filePath: path.join('coach-knowledge', file.filename),
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
    res.json({ data: doc });
  } catch (e) {
    res.status(500).json({ message: 'upload failed' });
  }
});

// Save free-form text knowledge
InteractionRoutes.post('/chat/engh/knowledge/text', async (req, res) => {
  try {
    const { text, title } = req.body || {};
    if (!text) return res.status(400).json({ message: 'text is required' });
    const doc = await CoachKnowledge.create({ coachId: (req as any).user?._id || undefined, title, text });
    res.json({ data: doc });
  } catch (e) {
    res.status(500).json({ message: 'save failed' });
  }
});

// First-time profile save/update
InteractionRoutes.post('/chat/engh/profile', async (req, res) => {
  try {
    let userId = (req as any).user?._id || req.body.userId;
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
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const payload = (({ goals, currentWeightKg, strengths, weaknesses, injuryHistory, nutritionPreferences, trainingDaysPerWeek }) => ({ goals, currentWeightKg, strengths, weaknesses, injuryHistory, nutritionPreferences, trainingDaysPerWeek }))(req.body || {});
    const doc = await UserProfile.findOneAndUpdate(
      { userId },
      { $set: payload, $setOnInsert: { userId } },
      { new: true, upsert: true }
    );
    res.json({ data: doc });
  } catch (e) {
    res.status(500).json({ message: 'profile save failed' });
  }
});

// Get profile (for onboarding check)
InteractionRoutes.get('/chat/engh/profile', async (req, res) => {
  try {
    let userId = (req as any).user?._id || (req.query.userId as string);
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
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const doc = await UserProfile.findOne({ userId });
    if (!doc) return res.status(404).json({ message: 'not found' });
    res.json({ data: doc });
  } catch (e) {
    res.status(500).json({ message: 'profile fetch failed' });
  }
});

export default InteractionRoutes;

// DEV: quick diagnostics to confirm plans exist for current user (no Auth)
InteractionRoutes.get('/debug/plans', async (req, res) => {
  try {
    const cookie = req.headers?.cookie as string | undefined;
    const match = cookie?.match(/auth_token=([^;]+)/);
    let userId: any;
    if (match) {
      try {
        const token = decodeURIComponent(match[1]);
        const secret = process.env.JWT_SECRET || 'secret_secret';
        const decoded: any = jwt.verify(token, secret);
        userId = decoded?.id || decoded?._id;
      } catch {}
    }
    if (!userId) return res.status(400).json({ message: 'userId not resolved from cookie' });
    const Models = await import('../app/Models/PlanModels');
    const [tp, np, g] = await Promise.all([
      Models.TrainingPlan.findOne({ userId, isCurrent: true }).sort({ version:-1 }).lean(),
      Models.NutritionPlan.findOne({ userId, isCurrent: true }).sort({ version:-1 }).lean(),
      Models.Goal.findOne({ userId, isCurrent: true }).sort({ version:-1 }).lean(),
    ]);
    return res.json({ userId, training: tp, nutrition: np, goal: g });
  } catch (e) {
    return res.status(500).json({ message: 'debug failed' });
  }
});

// Create training plan from free-form text sent by the assistant (quick import)
InteractionRoutes.post('/chat/engh/training/from-text', async (req, res) => {
  try {
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
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const rawText: string = (req.body?.text || '').replace(/\r/g,'');
    // Strip any preamble before the first "Dag X:" so we don't create a bogus first session
    const textFromFirstDay = /Dag\s*\d+\s*:/i.test(rawText)
      ? rawText.replace(/[\s\S]*?(?=Dag\s*\d+\s*:)/i, '')
      : rawText;
    const blocks = textFromFirstDay.split(/Dag\s*\d+\s*:/i).filter(Boolean);
    const pickFocus = ['Push','Pull','Legs','Overkropp','Underkropp','Fullkropp'];

    function extractExercises(src: string): { name:string; sets:number; reps:number }[] {
      const text = String(src)
        .replace(/<br\s*\/?>(?=\S)/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\r/g, '')
        .trim();
      const rawLines = text.split(/\n/).map(l=>l.trim()).filter(Boolean);
      // Merge two-line patterns: name on one line, scheme on the next
      const lines: string[] = [];
      for (let i=0; i<rawLines.length; i++) {
        const cur = rawLines[i];
        const next = rawLines[i+1] || '';
        const hasNumbers = /(\d{1,2})\s*(?:sett|set|x|×)/i.test(cur) || /(\d{1,2})\s*(?:reps|repetisjoner)/i.test(cur);
        const nextHasNumbers = /(\d{1,2})\s*(?:sett|set|x|×)/i.test(next) || /(\d{1,2})\s*(?:reps|repetisjoner)/i.test(next);
        const curLooksLikeName = /(^\d+\.|^[-•])?\s*[A-Za-zÆØÅæøå0-9/(),\.\-\s]+$/.test(cur) && !hasNumbers;
        if (curLooksLikeName && nextHasNumbers) {
          lines.push(`${cur} — ${next}`);
          i++; // skip next
        } else {
          lines.push(cur);
        }
      }
      const results: { name:string; sets:number; reps:number }[] = [];
      const banned = /(plan|treningsplan|muskelvekst|styrke:|generelle|tips|oppvarming|nedtrapping|progresjon|restituer|kalor|måltid|kosthold|notater|varighet|frekvens)/i;
      const nameGroup = "[A-Za-zÆØÅæøå0-9/()\\.,\-\s]+?";

      // Pass A: Enumerated items like "1. Benkpress (…)", with scheme possibly on following lines
      for (let i=0; i<lines.length; i++) {
        const l = lines[i];
        if (banned.test(l)) continue;
        const numMatch = l.match(/^\s*(\d+)\.\s*(.+)$/);
        if (!numMatch) continue;
        const nameCandidate = numMatch[2].replace(/\s*#.*$/, '').trim();
        if (!nameCandidate || /Dag\s*\d+:/i.test(nameCandidate)) continue;
        let sets: number | undefined;
        let reps: number | undefined;
        // try same merged line first
        let sameLine = l;
        const mSame = sameLine.match(/(\d{1,2})\s*(?:sett|set)[^\d]*(\d{1,2})/) || sameLine.match(/(\d{1,2})\s*[x×]\s*(\d{1,2})/);
        if (mSame) { sets = Number(mSame[1]); reps = Number(mSame[2]); }
        // search forward until next enumerated or blank
        for (let j=i+1; (!sets || !reps) && j<lines.length && !/^\s*\d+\./.test(lines[j]); j++) {
          const t = lines[j];
          if (banned.test(t)) continue;
          const m = t.match(/(\d{1,2})\s*(?:sett|set)[^\d]*(\d{1,2})/) || t.match(/(\d{1,2})\s*[x×]\s*(\d{1,2})/);
          if (m) { sets = Number(m[1]); reps = Number(m[2]); break; }
          const hold = t.match(/(\d{1,2})\s*(?:sett|set)[^\d]*hold/i);
          if (hold) { sets = Number(hold[1]); reps = 10; break; }
        }
        results.push({ name: nameCandidate, sets: sets || 3, reps: reps || 8 });
      }
      if (results.length) return results.slice(0, 8);
      for (const l of lines) {
        // Supported patterns:
        // "1. Benkpress – 3x8", "- Knebøy 4 x 6", "Roing: 3 sett x 10 reps"
        // Norwegian: "3 sett med 8–10 repetisjoner"
        const p1 = l.match(new RegExp(`\\d+\\.?\\s*(${nameGroup})\\s*[–-]\\s*(\\d{1,2})\\s*[x×]\\s*(\\d{1,2})`, 'i'));
        const p2 = l.match(new RegExp(`[-•]\\s*(${nameGroup})\\s*(\\d{1,2})\\s*[x×]\\s*(\\d{1,2})`, 'i'));
        const p3 = l.match(new RegExp(`(${nameGroup}):?\\s*(\\d{1,2})\\s*(?:sett|set)\\s*[x×]\\s*(\\d{1,2})\\s*(?:reps|repetisjoner)?`, 'i'));
        const p4 = l.match(new RegExp(`(${nameGroup})\\s*[:\u2013\u2014-]?\\s*(?:[-•]\\s*)?(\\d{1,2})\\s*(?:sett|set)\\s*(?:med\\s*)?(\\d{1,2})(?:[–-]\\d{1,2})?\\s*(?:reps|repetisjoner)?`, 'i'));
        const m = p1 || p2 || p3 || p4;
        if (m) {
          const name = m[1].trim();
          const sets = Number(m[2]) || 3;
          const reps = Number(m[3]) || 8;
          if (!banned.test(name)) results.push({ name, sets, reps });
          continue;
        }
        // Fallback: detect simple exercise name with leading bullet/number
        const nameOnly = l.match(new RegExp(`(?:\\d+\.|[-•])\\s*(${nameGroup})`));
        if (nameOnly) {
          const nm = nameOnly[1].trim();
          if (!banned.test(nm) && nm.length > 2) results.push({ name: nm, sets: 3, reps: 8 });
        }
      }
      // If no structured strength exercises were parsed, return empty list
      // (e.g., cardio or mobility days should not be populated with defaults)
      return results.slice(0, 8);
    }

    // Prefer splitting by explicit Norwegian weekday headers if present
    const normalized = rawText.replace(/\r/g, '');
    const lineSplit = normalized.split(/\n/);
    type DayBlock = { dayName: string; header: string; lines: string[] };
    const dayBlocks: DayBlock[] = [];
    let current: DayBlock | null = null;
    function normalizeAscii(s: string): string {
      return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function detectHeader(line: string): { dayName: string; header: string } | null {
      const trimmed = (line || '').trim().replace(/^[#*>-]\s*/, '');
      if (!trimmed) return null;
      const parts = trimmed.split(':');
      const head = parts[0].trim();
      const headAscii = normalizeAscii(head.toLowerCase());
      const map: Record<string, string> = {
        mandag: 'Mandag', tirsdag: 'Tirsdag', onsdag: 'Onsdag', torsdag: 'Torsdag', fredag: 'Fredag', lordag: 'Lørdag', sondag: 'Søndag',
        monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
      };
      for (const key of Object.keys(map)) {
        if (headAscii.startsWith(key)) {
          return { dayName: map[key], header: trimmed };
        }
      }
      return null;
    }
    for (const rawLine of lineSplit) {
      const h = detectHeader(rawLine);
      if (h) {
        if (current) dayBlocks.push(current);
        current = { dayName: h.dayName, header: h.header, lines: [] };
      } else if (current) {
        current.lines.push(rawLine);
      }
    }
    if (current) dayBlocks.push(current);

    // Fallback: block-based regex capture across the whole text
    if (dayBlocks.length < 2) {
      const re = new RegExp(
        String.raw`(^\s*(?:[#*>-]\s*)?(Mandag|Tirsdag|Onsdag|Torsdag|Fredag|L(?:ø|o)rdag|S(?:ø|o)ndag|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:?.*$)([\s\S]*?)(?=^\s*(?:[#*>-]\s*)?(?:Mandag|Tirsdag|Onsdag|Torsdag|Fredag|L(?:ø|o)rdag|S(?:ø|o)ndag|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:?.*$|$)`,
        'gmi'
      );
      const blocksRx: DayBlock[] = [];
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(normalized)) != null) {
        const dayName = mm[2];
        const header = mm[1].trim();
        const body = (mm[3] || '').split(/\n/);
        blocksRx.push({ dayName, header, lines: body });
      }
      if (blocksRx.length >= 2) {
        dayBlocks.length = 0;
        dayBlocks.push(...blocksRx);
      }
    }

    // Last-resort fallback: direct index scanning for weekday words (Nor/Eng)
    if (dayBlocks.length < 2) {
      const candidates = [
        'Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag',
        'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
      ];
      type Pos = { idx:number; label:string };
      const found: Pos[] = [];
      const lower = normalized.toLowerCase();
      for (const label of candidates) {
        const key = label.toLowerCase().replace('ø','o');
        // search for both exact and ascii-folded
        let i = 0; let last = -1;
        while ((i = lower.indexOf(key, last+1)) !== -1) {
          // ensure word boundary
          const before = i>0 ? lower[i-1] : '\n';
          const okBoundary = /[^a-zæøå]/i.test(before);
          if (okBoundary) found.push({ idx: i, label });
          last = i;
        }
      }
      found.sort((a,b)=> a.idx - b.idx);
      // merge consecutive duplicates and build blocks
      const unique: Pos[] = [];
      for (const p of found) {
        if (!unique.length || p.idx - unique[unique.length-1].idx > 3) unique.push(p);
      }
      if (unique.length >= 2) {
        dayBlocks.length = 0;
        for (let i=0;i<unique.length;i++){
          const start = unique[i].idx;
          const end = i+1<unique.length ? unique[i+1].idx : normalized.length;
          const slice = normalized.slice(start, end).split(/\n/);
          dayBlocks.push({ dayName: unique[i].label, header: slice[0] || unique[i].label, lines: slice.slice(1) });
        }
      }
    }

    function mapDayNameToCode(name: string): string {
      const n = name.toLowerCase();
      if (n.startsWith('man') || n.startsWith('mon')) return 'Mon';
      if (n.startsWith('tir') || n.startsWith('tue')) return 'Tue';
      if (n.startsWith('ons') || n.startsWith('wed')) return 'Wed';
      if (n.startsWith('tor') || n.startsWith('thu')) return 'Thu';
      if (n.startsWith('fre') || n.startsWith('fri')) return 'Fri';
      if (n.startsWith('lør') || n.startsWith('lor') || n.startsWith('sat')) return 'Sat';
      if (n.startsWith('søn') || n.startsWith('son') || n.startsWith('sun')) return 'Sun';
      return 'Mon';
    }

    // Build sessions from weekday splits, otherwise fall back to Dag-splits or single block
    let sessions = (dayBlocks.length ? dayBlocks : [] as DayBlock[])
      .map((db) => {
        // Extract simple focus from header after ':' if present
        const afterColon = db.header.split(':').slice(1).join(':').trim();
        const focus = afterColon || pickFocus[0];
        const bodyWithoutHeader = db.lines.join('\n');
        // Collect per-day notes (non-strength lines)
        const notes = db.lines
          .map(l => String(l || '').trim())
          .filter(Boolean)
          .filter(l => !/(\d{1,2})\s*(?:sett|set|x|×)/i.test(l))
          .filter(l => !/^\d+\./.test(l));
        return {
          day: mapDayNameToCode(db.dayName),
          focus,
          exercises: extractExercises(bodyWithoutHeader),
          notes,
        };
      });

    if (!sessions.length) {
      const sourceBlocks = (blocks.length ? blocks : [rawText]).slice(0, 7);
      sessions = sourceBlocks
        .map((block, i) => ({
          day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i % 7],
          focus: pickFocus[i % pickFocus.length],
          exercises: extractExercises(block),
          notes: [],
        }));
    }
    if (sessions.length === 0) {
      sessions.push({
        day: 'Mon',
        focus: pickFocus[0],
        exercises: extractExercises(rawText),
        notes: [],
      });
    }
    // Extract high-level guidelines from the text
    const guidelineLines = rawText.split(/\n/)
      .map(l=>l.trim())
      .filter(l=>/^[-•]\s/.test(l) && /(oppvarming|nedtrapping|restitusjon|lytt til kroppen|tips|notater)/i.test(l))
      .map(l=>l.replace(/^[-•]\s*/, ''))
      .slice(0, 10);

    const latest = await TrainingPlan.findOne({ userId }).sort({ version: -1 });
    const nextVersion = (latest?.version || 0) + 1;
    await TrainingPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
    const created = await TrainingPlan.create({ userId, version: nextVersion, isCurrent: true, sessions, sourceText: rawText, guidelines: guidelineLines });
    return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(created._id) }], message: 'Training plan imported to Assets' });
  } catch (e) {
    return res.status(500).json({ message: 'import failed' });
  }
});

// Save training plan (create new version)
InteractionRoutes.post('/chat/engh/training/save', async (req, res) => {
  try {
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
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
    if (!sessions.length) return res.status(400).json({ message: 'sessions required' });
    // Map sessions to versioning model shape
    const days = sessions.map((s: any) => ({ day: s.day, focus: s.focus, exercises: (s.exercises||[]).map((e:any)=>({ name: e.name||e.exercise, sets: e.sets, reps: String(e.reps), rpe: e.rpe })) }));
    const version = await nextTrainingVersion(userId);
    const doc = await TrainingPlanVersion.create({ user: userId, version, source: 'action', reason: 'Saved via chat', days });
    await StudentState.findOneAndUpdate({ user: userId }, { $set: { currentTrainingPlanVersion: doc._id } }, { upsert: true });
    try { await ChangeEvent.create({ user: userId, type: 'PLAN_EDIT', summary: `Training v${version} saved`, refId: doc._id }); } catch {}
    try { await publish({ type: 'PLAN_UPDATED', user: userId as any }); } catch {}
    return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(doc._id) }], message: 'Training plan saved' });
  } catch (e) {
    return res.status(500).json({ message: 'save failed' });
  }
});

// Save nutrition plan (create new version)
InteractionRoutes.post('/chat/engh/nutrition/save', async (req, res) => {
  try {
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
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const { dailyTargets, meals, days, guidelines, sourceText } = req.body || {};
    if (!dailyTargets) return res.status(400).json({ message: 'dailyTargets required' });
    const version = await nextNutritionVersion(userId as any);
    const doc = await NutritionPlanVersion.create({ user: userId, version, source: 'action', reason: 'Saved via chat', kcal: dailyTargets.kcal, proteinGrams: dailyTargets.protein, carbsGrams: dailyTargets.carbs, fatGrams: dailyTargets.fat });
    await StudentState.findOneAndUpdate({ user: userId }, { $set: { currentNutritionPlanVersion: doc._id } }, { upsert: true });
    try { await ChangeEvent.create({ user: userId, type: 'NUTRITION_EDIT', summary: `Nutrition v${version} saved`, refId: doc._id }); } catch {}
    try { await publish({ type: 'NUTRITION_UPDATED', user: userId as any }); } catch {}
    return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'nutrition', planId: String(doc._id) }], message: 'Meal plan saved' });
  } catch (e) {
    return res.status(500).json({ message: 'save failed' });
  }
});

// Public share endpoints (JSON)
InteractionRoutes.get('/plans/share/training/:id', async (req, res) => {
  try {
    const plan = await TrainingPlan.findById(req.params.id).lean();
    if (!plan) return res.status(404).json({ message: 'not found' });
    res.json({ plan });
  } catch {
    res.status(500).json({ message: 'share failed' });
  }
});

InteractionRoutes.get('/plans/share/nutrition/:id', async (req, res) => {
  try {
    const plan = await NutritionPlan.findById(req.params.id).lean();
    if (!plan) return res.status(404).json({ message: 'not found' });
    res.json({ plan });
  } catch {
    res.status(500).json({ message: 'share failed' });
  }
});
// Create nutrition plan from free-form text
InteractionRoutes.post('/chat/engh/nutrition/from-text', async (req, res) => {
  try {
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
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const text: string = (req.body?.text || '')
      .replace(/<br\s*\/?>(?=\S)/gi, '\n')
      .replace(/\r/g, '');
    // Robust: try common patterns first; then derive macros if absent
    const kcal = Number((text.match(/(\d{3,4})\s*(?:kcal|kalorier)/i) || [])[1]) || 2400;
    const pMatch = text.match(/protein[^\d]*(\d{2,4})\s*(?:g|gram)?/i);
    const cMatch = text.match(/(?:carb|karb|karbo)[^\d]*(\d{2,4})\s*(?:g|gram)?/i);
    const fMatch = text.match(/(?:fett|fat)[^\d]*(\d{2,4})\s*(?:g|gram)?/i);
    let protein = pMatch ? Number(pMatch[1]) : undefined as any;
    let carbs = cMatch ? Number(cMatch[1]) : undefined as any;
    let fat = fMatch ? Number(fMatch[1]) : undefined as any;
    if (protein == null || carbs == null || fat == null) {
      // derive using 30/50/20 split
      protein = protein ?? Math.round((kcal * 0.3) / 4);
      carbs = carbs ?? Math.round((kcal * 0.5) / 4);
      fat = fat ?? Math.round((kcal * 0.2) / 9);
    }
    // Parse simple meals per day and extract guidelines
    // Support Norwegian (Dag) and English (Day)
    // Normalize section markers separating days (--- lines) to ensure splits don't swallow content
    const normalized = text
      .replace(/\r/g, '')
      .replace(/\n\s*---+\s*\n/g, '\n')
      .replace(/^\s*#\s*$/gm, '')
      .replace(/\*\*/g, ''); // strip bold markers so labels match
    // Support markdown headings like "#### Day 1" or plain "Day 1"
    const daySplits = normalized.split(/\n\s*#{0,6}\s*(?:Dag|Day)\s*(\d+)\b[^\n]*\n/i);
    // Support Norwegian and English meal names
    function labelPattern(name:string){
      return new RegExp(`(?:\\*\\*)?${name}(?:\\*\\*)?\\s*:?`, 'i');
    }
    const mealNames: {label:string; pattern:RegExp}[] = [
      { label: 'Frokost', pattern: labelPattern('Frokost') },
      { label: 'Lunsj', pattern: labelPattern('Lunsj') },
      { label: 'Middag', pattern: labelPattern('Middag') },
      { label: 'Snack', pattern: labelPattern('Snack') },
      { label: 'Breakfast', pattern: labelPattern('Breakfast') },
      { label: 'Lunch', pattern: labelPattern('Lunch') },
      { label: 'Dinner', pattern: labelPattern('Dinner') },
    ];
    const meals: { name:string; items:string[] }[] = [];
    const daysParsed: { label:string; meals:{ name:string; items:string[] }[] }[] = [];
    if (daySplits.length > 1) {
      for (let i=1; i<daySplits.length; i+=2) {
        const label = `Dag ${daySplits[i]}`;
        const block = (daySplits[i+1] || '').split(/\n\s*#?\s*(?:Dag|Day)\s*\d+[^\n]*\n/i)[0];
        const dayMeals: { name:string; items:string[] }[] = [];
        for (const def of mealNames) {
          const parts = block.split(def.pattern);
          if (parts.length > 1) {
            const stopAtNext = /\n\s*(?=#+)|\n\s*(?:Dag|Day)\s*\d+\b|\n\s*(?:\*\*\s*)?(?:Frokost|Lunsj|Middag|Snack|Breakfast|Lunch|Dinner)(?:\*\*)?\s*:/i;
            const after = parts[1].split(stopAtNext)[0] || '';
            const items = after.split(/\n/)
              .map(l=>l.replace(/^[-•]\s*/, '').trim())
              .filter(Boolean)
              .filter(l=>l !== '**' && l !== '*');
            if (items.length) dayMeals.push({ name: def.label, items });
          }
        }
        if (dayMeals.length) daysParsed.push({ label, meals: dayMeals });
      }
    } else {
      // single generic block → collect meals without day labels
      for (const def of mealNames) {
        const parts = text.split(def.pattern);
        if (parts.length > 1) {
          const stopAtNext = /\n\s*(?=#+)|\n\s*(?:Dag|Day)\s*\d+\b|\n\s*(?:\*\*\s*)?(?:Frokost|Lunsj|Middag|Snack|Breakfast|Lunch|Dinner)(?:\*\*)?\s*:/i;
          const after = parts[1].split(stopAtNext)[0] || '';
          const items = after.split(/\n/)
            .map(l=>l.replace(/^[-•]\s*/, '').trim())
            .filter(Boolean)
            .filter(l=>l !== '**' && l !== '*');
          if (items.length) meals.push({ name: def.label, items });
        }
      }
    }
    // Extract global guidelines (outside day sections) so they don't get merged into any day's Snack
    const guidelines = normalized.split(/\n/)
      .map(l=>l.trim())
      .filter(l=>/^[-•]\s/.test(l) && /(Hydrering|Justering|Variasjon|Forberedelse|General\s*Tips|Generelle\s*Tips)/i.test(l))
      .map(l=>l.replace(/^[-•]\s*/, ''));

    const latest = await NutritionPlan.findOne({ userId }).sort({ version: -1 });
    const nextVersion = (latest?.version || 0) + 1;
    await NutritionPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
    const created = await NutritionPlan.create({ userId, version: nextVersion, isCurrent: true, dailyTargets: { kcal, protein, carbs, fat }, notes: '', sourceText: text, meals: meals.length?meals:undefined, guidelines, days: daysParsed.length?daysParsed:undefined });
    return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'nutrition', planId: String(created._id) }], message: 'Meal plan imported to Assets' });
  } catch (e) {
    return res.status(500).json({ message: 'import failed' });
  }
});

// Create simple goal from free-form text
InteractionRoutes.post('/chat/engh/goals/from-text', async (req, res) => {
  try {
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
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const text: string = (req.body?.text || '').replace(/\r/g, '');
    const targetWeight = Number((text.match(/(\d{2,3})\s*kg/i) || [])[1]) || undefined;
    const strength = (text.match(/(benk|knebøy|kneboy|mark|markløft|styrke)[^\n]*/i) || [])[0] || '';
    const horizon = Number((text.match(/(\d{1,2})\s*(?:uker|weeks|mnd|måneder|months)/i) || [])[1]) || 8;
    const deficit = Number((text.match(/(\d{3,4})\s*kcal[^\n]*(?:defisit|underskudd)/i) || [])[1]) || undefined;
    const weeklyLoss = Number((text.match(/(0?\.\d|\d)\s*kg\s*(?:per\s*uke|\/?week)/i) || [])[1]) || undefined;
    const weeklyMinutes = Number((text.match(/(\d{2,3})\s*min(?:utter)?\s*(?:per\s*uke|\/?week)/i) || [])[1]) || undefined;
    const hydration = Number((text.match(/(\d(?:\.\d)?)\s*l(?:iter)?/i) || [])[1]) || undefined;

    function collectSection(labels: string[]): string[] {
      // Build a combined heading regex that tolerates optional colon and parentheses
      const heading = new RegExp(`^(?:${labels.map(l=>l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join('|')})\b[^\n]*$`, 'i+m');
      const match = text.match(heading);
      if (!match) return [];
      const startIdx = match.index ?? 0;
      // Slice from the end of the matched heading line
      const after = text.slice(startIdx + match[0].length);
      // Stop at next heading of any known type
      const stopper = new RegExp(`\n\s*(?=^(?:Kortsiktige mål|Kort sikt|Mellomlangsiktige mål|Mellomlang sikt|Langsiktige mål|Lang sikt|Short\s*-?\s*Term|Medium\s*-?\s*Term|Long\s*-?\s*Term|Tips(?:\s*for\s*å\s*oppnå\s*målene)?|Generelle mål)\b)`, 'i+m');
      const body = (after.split(stopper)[0] || '').trim();
      // Extract list items (bullets or enumerated)
      const lines = body.split(/\n/).map(l=>l.trim()).filter(Boolean);
      const items: string[] = [];
      for (const l of lines) {
        const bullet = l.replace(/^[-•]\s*/, '').trim();
        const enumerated = l.match(/^\d+\.?\s+(.*)$/)?.[1]?.trim();
        const candidate = (enumerated || bullet).replace(/^\*+|\*+$/g, '').trim();
        if (candidate) items.push(candidate);
      }
      return items.slice(0, 12);
    }

    const shortTerm = collectSection(['Kortsiktige mål', 'Kort sikt', 'Short Term', 'Short-Term']);
    const mediumTerm = collectSection(['Mellomlangsiktige mål', 'Mellomlang sikt', 'Medium Term', 'Medium-Term']);
    const longTerm = collectSection(['Langsiktige mål', 'Lang sikt', 'Long Term', 'Long-Term']);
    const tipsA = collectSection(['Tips for å oppnå målene', 'Tips', 'Additional Tips']);
    const tipsB = collectSection(['Generelle mål']);
    const unique = (arr: string[]) => Array.from(new Set(arr.map(s=>s.trim()))).filter(Boolean);
    const plan = {
      shortTerm,
      mediumTerm,
      longTerm,
      tips: unique([...(tipsA||[]), ...(tipsB||[])]),
    };
    const latest = await Goal.findOne({ userId }).sort({ version: -1 });
    const nextVersion = (latest?.version || 0) + 1;
    await Goal.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
    const created = await Goal.create({ userId, version: nextVersion, isCurrent: true, targetWeightKg: targetWeight, strengthTargets: strength, horizonWeeks: horizon, sourceText: text, caloriesDailyDeficit: deficit, weeklyWeightLossKg: weeklyLoss, weeklyExerciseMinutes: weeklyMinutes, hydrationLiters: hydration, plan });
    return res.json({ actions: [{ type: 'GOAL_SET', goalId: String(created._id) }], message: 'Goal imported to Assets' });
  } catch (e) {
    return res.status(500).json({ message: 'import failed' });
  }
});
