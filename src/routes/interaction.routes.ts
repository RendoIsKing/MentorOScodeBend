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
import { Router } from 'express';
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
InteractionRoutes.post('/interaction/actions/apply', async (req, res) => {
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
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const { type, payload } = req.body || {};
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
      const patch = patchSetDaysPerWeek(currentTraining.days as any, Number(payload?.daysPerWeek || 3));
      const ret = await applyTrainingPatch(userId, currentTraining, patch);
      return res.json({ ok: true, summary: patch.reason.summary, ...ret });
    }
    if (type === 'NUTRITION_SET_CALORIES') {
      const kcal = Number(payload?.kcal);
      const ret = await applyNutritionPatch(userId, { kcal, reason: { summary: `Kalorier satt til ${kcal}` } } as any);
      return res.json({ ok: true, summary: `Kalorier satt til ${kcal}`, ...ret });
    }
    if (type === 'WEIGHT_LOG') {
      const { date, kg } = payload || {};
      const { WeightEntry } = await import('../app/Models/WeightEntry');
      await WeightEntry.updateOne({ userId, date }, { $set: { kg } }, { upsert: true });
      try { const ChangeEvent = (await import('../models/ChangeEvent')).default; await ChangeEvent.create({ user: userId, type: 'WEIGHT_LOG', summary: `Weight ${kg}kg on ${date}` }); } catch {}
      await publish({ type: 'WEIGHT_LOGGED', user: userId, date, kg });
      return res.json({ ok: true, summary: `Vekt ${kg}kg lagret` });
    }
    if (type === 'WEIGHT_DELETE') {
      const { date } = payload || {};
      const { WeightEntry } = await import('../app/Models/WeightEntry');
      await WeightEntry.deleteOne({ userId, date });
      try { const ChangeEvent = (await import('../models/ChangeEvent')).default; await ChangeEvent.create({ user: userId, type: 'WEIGHT_LOG', summary: `Weight entry deleted for ${date}` }); } catch {}
      await publish({ type: 'WEIGHT_LOGGED', user: userId });
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
    const [tp, np, g] = await Promise.all([
      (await import('../app/Models/PlanModels')).then(m=>m.TrainingPlan.findOne({ userId, isCurrent: true }).sort({ version:-1 }).lean()),
      (await import('../app/Models/PlanModels')).then(m=>m.NutritionPlan.findOne({ userId, isCurrent: true }).sort({ version:-1 }).lean()),
      (await import('../app/Models/PlanModels')).then(m=>m.Goal.findOne({ userId, isCurrent: true }).sort({ version:-1 }).lean()),
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
      if (results.length === 0) {
        return [
          { name: 'Benkpress', sets: 3, reps: 8 },
          { name: 'Knebøy', sets: 3, reps: 8 },
          { name: 'Roing', sets: 3, reps: 10 },
        ];
      }
      return results.slice(0, 8);
    }

    // Build sessions either by explicit Dag-splitting or a single fallback session
    const sourceBlocks = (blocks.length ? blocks : [rawText]).slice(0, 7);
    const sessions = sourceBlocks.map((block, i) => ({
      day: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i % 7],
      focus: pickFocus[i % pickFocus.length],
      exercises: extractExercises(block),
    })).filter(s => (s.exercises?.length || 0) > 0);
    if (sessions.length === 0) {
      sessions.push({
        day: 'Mon',
        focus: pickFocus[0],
        exercises: extractExercises(rawText),
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
    const text: string = req.body?.text || '';
    const targetWeight = Number((text.match(/(\d{2,3})\s*kg/i) || [])[1]) || undefined;
    const strength = (text.match(/(benk|squat|mark|styrke)[^\n]*/i) || [])[0] || '';
    const horizon = Number((text.match(/(\d{1,2})\s*(?:uker|weeks)/i) || [])[1]) || 8;
    const deficit = Number((text.match(/(\d{3,4})\s*kcal[^\n]*defisit/i) || [])[1]) || undefined;
    const weeklyLoss = Number((text.match(/(0?\.\d|\d)\s*kg\s*per\s*uke/i) || [])[1]) || undefined;
    const weeklyMinutes = Number((text.match(/(\d{2,3})\s*min(?:utter)?\s*per\s*uke/i) || [])[1]) || undefined;
    const hydration = Number((text.match(/(\d(?:\.\d)?)\s*l(?:iter)?/i) || [])[1]) || undefined;
    function collect(section: RegExp) {
      const m = text.split(section);
      if (m.length < 2) return [] as string[];
      const body = m[1].split(/\n\s*\n|Long-Term|Medium-Term|Short-Term|Additional Tips|Tips/i)[0];
      return body.split(/\n/).map(l=>l.replace(/^[-•]\s*/, '').trim()).filter(Boolean).slice(0,8);
    }
    const plan = {
      shortTerm: collect(/Short\s*-?\s*Term/i),
      mediumTerm: collect(/Medium\s*-?\s*Term/i),
      longTerm: collect(/Long\s*-?\s*Term/i),
      tips: collect(/Additional\s*Tips|Tips/i),
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
