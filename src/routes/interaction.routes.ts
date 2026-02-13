import { Router } from "express";
// zod not used directly in this file (schemas are imported from Validation)
import { ActionSchema, type ActionBody, DaysPerWeekSchema, NutritionCaloriesSchema, SwapExerciseSchema, WeightDeleteSchema, WeightLogSchema } from '../app/Validation/schemas';
import { Auth as ensureAuth, validateZod } from "../app/Middlewares";
import * as Sentry from '@sentry/node';
import { perUserIpLimiter } from "../app/Middlewares/rateLimiters";
import { InteractionController } from "../app/Controllers/Interaction";
import { chatWithCoachEngh, chatWithCoachMajen } from "../app/Controllers/Interaction/chat.controller";
import { generateFirstPlans } from "../app/Controllers/Interaction/generateFirstPlans";
import { decideAndApplyAction } from "../app/Controllers/Interaction/decisionEngine";
import { db, findById, findOne, insertOne, updateMany, upsert, Tables } from "../lib/db";
import { nextTrainingVersion, nextNutritionVersion } from "../services/versioning/nextVersion";
import { publish } from "../services/events/publish";
import { patchSwapExercise, patchSetDaysPerWeek } from "../services/planRules/training";
import { applyTrainingPatch, applyNutritionPatch } from "../services/planRules/materialize";
import { createMulterInstance } from '../app/Middlewares/fileUpload';
import { FileEnum } from '../types/FileEnum';
import { getThread, appendMessage, clearThread } from '../app/Controllers/Interaction/thread.controller';
import { z } from "zod";
import { objectId } from "../app/Validation/requestSchemas";
import { generateEmbedding } from "../services/ai/embeddingService";

const uploadRoot =
  (process.env.UPLOAD_ROOT
    ? (require('path') as typeof import('path')).isAbsolute(process.env.UPLOAD_ROOT)
      ? process.env.UPLOAD_ROOT
      : `${process.cwd()}${process.env.UPLOAD_ROOT}`
    : `${process.cwd()}${FileEnum.PUBLICDIR}`);
const knowledgeUpload = createMulterInstance(`${uploadRoot}/coach-knowledge`);
import { Auth } from "../app/Middlewares";

const InteractionRoutes: Router = Router();

const writeMethods = new Set(["POST", "PATCH", "DELETE"]);
const bodyObjectSchema = z.object({}).passthrough();
InteractionRoutes.use((req, res, next) => {
  if (!writeMethods.has(req.method)) return next();
  return validateZod({ body: bodyObjectSchema })(req, res, next);
});
InteractionRoutes.use((req, res, next) => {
  if (!writeMethods.has(req.method)) return next();
  try {
    const params = req.params || {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.length === 24) {
        const parsed = objectId.safeParse(value);
        if (!parsed.success) {
          return res.status(422).json({ error: "validation_failed", details: { [key]: "Invalid id format" } });
        }
      }
    }
  } catch {}
  return next();
});

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
InteractionRoutes.post("/chat/engh", ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), chatWithCoachEngh);
// Coach Majen avatar chat (mirror of Engh path shape)
InteractionRoutes.post("/chat/majen", ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), chatWithCoachMajen);
// Expose Majen coach user for FE convenience (dev only if seeded)
InteractionRoutes.get('/chat/majen/coach', ensureAuth as any, async (req, res) => {
  try {
    const u = await findOne(Tables.USERS, { user_name: 'coach-majen' });
    if (!u?.id) return res.status(404).json({ message: 'not found' });
    return res.json({ id: String(u.id), userName: u.user_name, fullName: u.full_name });
  } catch {
    return res.status(500).json({ message: 'lookup failed' });
  }
});
InteractionRoutes.post('/chat/engh/plans/generate-first', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 20 }), generateFirstPlans);
// Open endpoint publicly (no Auth) to make it easy to call from chat UI
InteractionRoutes.post('/chat/engh/action', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 30 }), decideAndApplyAction);
// Unified actions endpoint (rules engine)
function validateActionBody(body: any, userId: string): { ok: true; data: ActionBody } | { ok: false; error: any }{
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.flatten() } as const;
  return { ok: true, data: { ...parsed.data, userId } } as const;
}
InteractionRoutes.post('/interaction/actions/apply', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_ACTIONS_PER_MIN || 30) }), async (req, res) => {
  try { Sentry.addBreadcrumb({ category: 'actions', message: 'action-apply', level: 'info', data: { type: req.body?.type } }); } catch {}
  try {
    let userId: any = (req as any).user?._id || (req as any).user?.id || req.body.userId;
    if (!userId) {
      // Dev fallback: if running with dev routes enabled and no session cookie was forwarded
      try {
        const enabled = String(process.env.DEV_LOGIN_ENABLED || '').trim().toLowerCase();
        if (enabled === 'true' || (process.env.NODE_ENV !== 'production')) {
          const demo = await findOne(Tables.USERS, { email: 'demo@mentoros.app' });
          if (demo?.id) userId = String(demo.id);
        }
      } catch {}
    }
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const validated = validateActionBody(req.body, typeof userId==='string'?userId: String(userId||''));
    if (!validated.ok) return res.status(422).json({ error: 'validation_failed', details: validated.error });
    const { type, payload } = validated.data as any;

    // Safety rails
    const MIN_KCAL = 1200;
    const MAX_KCAL = 5000;
    const MAX_VOL_JUMP = 0.20; // 20%

    if (type === 'NUTRITION_SET_CALORIES') {
      const parsed = NutritionCaloriesSchema.safeParse(payload);
      if (!parsed.success) return res.status(422).json({ error: 'validation_failed', details: parsed.error.flatten() });
      const kcal = Number(parsed.data.kcal);
      if (kcal < MIN_KCAL || kcal > MAX_KCAL) return res.status(422).json({ error: `kcal must be between ${MIN_KCAL} and ${MAX_KCAL}` });
    }
    // Read current versions via StudentState pointers
    const { data: state } = await db.from(Tables.STUDENT_STATES).select('*').eq('user_id', userId).maybeSingle();
    const currentTraining = state?.current_training_plan_version ? await findById(Tables.TRAINING_PLAN_VERSIONS, state.current_training_plan_version) : null;

    if (type === 'PLAN_SWAP_EXERCISE') {
      const vr = SwapExerciseSchema.safeParse(payload);
      if (!vr.success) return res.status(422).json({ error: 'validation_failed', details: vr.error.flatten() });
      if (!currentTraining) return res.status(404).json({ error: 'No current training plan' });
      const patch = patchSwapExercise(currentTraining.days as any, vr.data.day || 'Mon', vr.data.from, vr.data.to);
      const ret = await applyTrainingPatch(userId, currentTraining, patch);
      return res.json({ ok: true, summary: patch.reason.summary, ...ret });
    }
    if (type === 'PLAN_SET_DAYS_PER_WEEK') {
      const vr = DaysPerWeekSchema.safeParse(payload);
      if (!vr.success) return res.status(422).json({ error: 'validation_failed', details: vr.error.flatten() });
      if (!currentTraining) return res.status(404).json({ error: 'No current training plan' });
      const nextDays = Number(vr.data.daysPerWeek || 3);
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
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'NUTRITION_EDIT', summary: `Satte kalorier: ${kcal} kcal`, actor: (req as any)?.user?._id || (req as any)?.user?.id, before_data: { current: state?.current_nutrition_plan_version }, after_data: { kcal } }); } catch {}
      return res.json({ ok: true, summary: `Kalorier satt til ${kcal}`, ...ret });
    }
    if (type === 'WEIGHT_LOG') {
      const vr = WeightLogSchema.safeParse(payload);
      if (!vr.success) return res.status(422).json({ error: 'validation_failed', details: vr.error.flatten() });
      const { date, kg } = vr.data;
      await upsert(Tables.WEIGHT_ENTRIES, { user_id: userId, date, kg }, 'user_id,date');
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'WEIGHT_LOG', summary: `Logget vekt: ${kg} kg (${date})`, actor: (req as any)?.user?._id || (req as any)?.user?.id, after_data: { date, kg } }); } catch {}
      await publish({ type: 'WEIGHT_LOGGED', user: userId, date, kg });
      return res.json({ ok: true, summary: `Vekt ${kg}kg lagret` });
    }
    if (type === 'WEIGHT_DELETE') {
      const vr = WeightDeleteSchema.safeParse(payload);
      if (!vr.success) return res.status(422).json({ error: 'validation_failed', details: vr.error.flatten() });
      const { date } = vr.data;
      await db.from(Tables.WEIGHT_ENTRIES).delete().eq('user_id', userId).eq('date', date);
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'WEIGHT_LOG', summary: `Weight entry deleted for ${date}`, actor: (req as any)?.user?._id || (req as any)?.user?.id, before_data: { date } }); } catch {}
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
InteractionRoutes.post('/actions/apply', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_ACTIONS_PER_MIN || 30) }), async (req, res) => {
  try {
    let userId: any = (req as any).user?._id || (req as any).user?.id || req.body.userId;
    if (!userId) {
      // Dev fallback: if running with dev routes enabled and no session cookie was forwarded
      try {
        const enabled = String(process.env.DEV_LOGIN_ENABLED || '').trim().toLowerCase();
        if (enabled === 'true' || (process.env.NODE_ENV !== 'production')) {
          const demo = await findOne(Tables.USERS, { email: 'demo@mentoros.app' });
          if (demo?.id) userId = String(demo.id);
        }
      } catch {}
    }
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const validated = validateActionBody(req.body, typeof userId==='string'?userId: String(userId||''));
    if (!validated.ok) return res.status(422).json({ error: 'validation_failed', details: validated.error });
    const { type, payload } = validated.data as any;

    const MIN_KCAL = 1200;
    const MAX_KCAL = 5000;
    const MAX_VOL_JUMP = 0.20;

    if (type === 'NUTRITION_SET_CALORIES') {
      const kcal = Number(payload?.kcal);
      if (!Number.isFinite(kcal)) return res.status(400).json({ error: 'kcal required' });
      if (kcal < MIN_KCAL || kcal > MAX_KCAL) return res.status(422).json({ error: `kcal must be between ${MIN_KCAL} and ${MAX_KCAL}` });
    }
    const { data: state } = await db.from(Tables.STUDENT_STATES).select('*').eq('user_id', userId).maybeSingle();
    const currentTraining = state?.current_training_plan_version ? await findById(Tables.TRAINING_PLAN_VERSIONS, state.current_training_plan_version) : null;

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
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'NUTRITION_EDIT', summary: `Satte kalorier: ${kcal} kcal`, actor: (req as any)?.user?._id || (req as any)?.user?.id, before_data: { current: state?.current_nutrition_plan_version }, after_data: { kcal } }); } catch {}
      return res.json({ ok: true, summary: `Kalorier satt til ${kcal}`, ...ret });
    }
    if (type === 'WEIGHT_LOG') {
      const { date, kg } = payload || {};
      await upsert(Tables.WEIGHT_ENTRIES, { user_id: userId, date, kg }, 'user_id,date');
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'WEIGHT_LOG', summary: `Logget vekt: ${kg} kg (${date})`, actor: (req as any)?.user?._id || (req as any)?.user?.id, after_data: { date, kg } }); } catch {}
      await publish({ type: 'WEIGHT_LOGGED', user: userId, date, kg });
      return res.json({ ok: true, summary: `Vekt ${kg}kg lagret` });
    }
    if (type === 'WEIGHT_DELETE') {
      const { date } = payload || {};
      await db.from(Tables.WEIGHT_ENTRIES).delete().eq('user_id', userId).eq('date', date);
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'WEIGHT_LOG', summary: `Weight entry deleted for ${date}`, actor: (req as any)?.user?._id || (req as any)?.user?.id, before_data: { date } }); } catch {}
      await publish({ type: 'WEIGHT_DELETED', user: userId as any, date });
      return res.json({ ok: true, summary: `Vekt slettet (${date})` });
    }
    return res.status(400).json({ error: 'Unknown action type' });
  } catch (e) {
    return res.status(500).json({ error: 'Action apply failed' });
  }
});

  // Apply a plan change proposed by AI (text plan with strict header)
  // Body: { text: string, userId?: string }
InteractionRoutes.post('/actions/applyPlanChange', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 20 }), async (req, res) => {
    try {
      const text: string = String((req.body||{}).text || '').trim();
      if (!text) return res.status(400).json({ ok:false, error: 'text_required' });

      // Basic validation per spec
      // Header lines: ^(Ny|Endring på) ...\n##Type: (Treningsplan|Kostholdsplan|Mål)\nPlan: ...
      const headerRe = /^(Ny|Endring på)\s.+\n\s*##Type:\s*(Treningsplan|Kostholdsplan|Mål)\s*\n\s*Plan:\s*(.+)$/im;
      const m = text.match(headerRe);
      if (!m) return res.status(422).json({ ok:false, error:'invalid_header' });
      const type = (m[2]||'').trim();

      // Require all weekdays listed at least once (Norwegian names) - now properly supports the new format
      const days = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'];
      const missing = days.filter(d=> !new RegExp(`^\s*${d}\s*:`, 'im').test(text));
      if (missing.length) return res.status(422).json({ ok:false, error:'missing_days', missing });

      // Decide underlying importer based on type
      const api = type.toLowerCase();
      const userId = (req as any)?.user?._id || (req as any)?.user?.id || req.body?.userId || undefined;

      // Reuse existing from-text endpoints for materialization
      if (api.includes('trenings')) {
        try {
          const { default: fetch } = await import('node-fetch');
          const base = process.env.API_BASE_INTERNAL || `http://localhost:${process.env.PORT || 3006}`;
          const r = await fetch(`${base}/api/backend/v1/interaction/chat/engh/training/from-text`, { method:'POST', headers:{ 'Content-Type':'application/json', cookie: req.headers.cookie||'' }, body: JSON.stringify({ text, userId }) as any } as any);
          const j = await r.json().catch(()=>({}));
          if (!j?.actions?.length) return res.status(500).json({ ok:false, error:'apply_failed' });
          return res.json({ ok:true, type:'Treningsplan', summary: j?.summary || 'Training plan applied' });
        } catch {
          return res.status(500).json({ ok:false, error:'apply_failed' });
        }
      }
      if (api.includes('kostholds')) {
        try {
          const { default: fetch } = await import('node-fetch');
          const base = process.env.API_BASE_INTERNAL || `http://localhost:${process.env.PORT || 3006}`;
          const r = await fetch(`${base}/api/backend/v1/interaction/chat/engh/nutrition/from-text`, { method:'POST', headers:{ 'Content-Type':'application/json', cookie: req.headers.cookie||'' }, body: JSON.stringify({ text, userId }) as any } as any);
          const j = await r.json().catch(()=>({}));
          if (!j?.actions?.length) return res.status(500).json({ ok:false, error:'apply_failed' });
          return res.json({ ok:true, type:'Kostholdsplan', summary: j?.summary || 'Nutrition plan applied' });
        } catch { return res.status(500).json({ ok:false, error:'apply_failed' }); }
      }
      if (api.includes('mål') || api.includes('mal')) {
        try {
          const { default: fetch } = await import('node-fetch');
          const base = process.env.API_BASE_INTERNAL || `http://localhost:${process.env.PORT || 3006}`;
          const r = await fetch(`${base}/api/backend/v1/interaction/chat/engh/goals/from-text`, { method:'POST', headers:{ 'Content-Type':'application/json', cookie: req.headers.cookie||'' }, body: JSON.stringify({ text, userId }) as any } as any);
          const j = await r.json().catch(()=>({}));
          if (!j?.actions?.length) return res.status(500).json({ ok:false, error:'apply_failed' });
          return res.json({ ok:true, type:'Mål', summary: j?.summary || 'Goals applied' });
        } catch { return res.status(500).json({ ok:false, error:'apply_failed' }); }
      }

      return res.status(422).json({ ok:false, error:'unknown_type', type });
    } catch {
      return res.status(500).json({ ok:false, error:'server_error' });
    }
  });
// Thread persistence (parameterized partner)
InteractionRoutes.get('/chat/:partner/thread', Auth, getThread);
// Make thread persistence usable from public avatar chat pages
InteractionRoutes.get('/chat/:partner/messages', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), getThread);
InteractionRoutes.post('/chat/:partner/message', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 60 }), appendMessage);
InteractionRoutes.post('/chat/:partner/clear', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 20 }), clearThread);

// Get current goal for user
InteractionRoutes.get('/chat/engh/goals/current', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const { data: goal } = await db.from(Tables.GOALS).select('*').eq('user_id', userId).eq('is_current', true).order('version', { ascending: false }).limit(1).maybeSingle();
    if (!goal) return res.status(404).json({ message: 'not found' });
    return res.json({ data: goal });
  } catch (e) {
    return res.status(500).json({ message: 'goal fetch failed' });
  }
});

// Get current training plan for user (mirrors goals/current behavior)
InteractionRoutes.get('/chat/engh/training/current', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const { data: plan } = await db.from(Tables.TRAINING_PLANS).select('*').eq('user_id', userId).eq('is_current', true).order('version', { ascending: false }).limit(1).maybeSingle();
    if (!plan) return res.status(404).json({ message: 'not found' });
    return res.json({ data: plan });
  } catch (e) {
    return res.status(500).json({ message: 'training fetch failed' });
  }
});

// Get current nutrition plan for user
InteractionRoutes.get('/chat/engh/nutrition/current', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const { data: plan } = await db.from(Tables.NUTRITION_PLANS).select('*').eq('user_id', userId).eq('is_current', true).order('version', { ascending: false }).limit(1).maybeSingle();
    if (!plan) return res.status(404).json({ message: 'not found' });
    return res.json({ data: plan });
  } catch (e) {
    return res.status(500).json({ message: 'nutrition fetch failed' });
  }
});

// Upload coach knowledge files (for now, tied to Coach Engh; later use coachId param)
InteractionRoutes.post('/chat/engh/knowledge/upload', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 10 }), knowledgeUpload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'file is required' });
    const content = `Uploaded file: ${file.originalname}`;
    const embedding = await generateEmbedding(content);
    const doc = await insertOne(Tables.COACH_KNOWLEDGE, {
      user_id: (req as any).user?._id || (req as any).user?.id || undefined,
      title: file.originalname,
      content,
      type: "pdf",
      embedding,
    });
    return res.json({ data: doc });
  } catch (e) {
    return res.status(500).json({ message: 'upload failed' });
  }
});

// Save free-form text knowledge
InteractionRoutes.post('/chat/engh/knowledge/text', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 30 }), async (req, res) => {
  try {
    const { text, title } = req.body || {};
    if (!text) return res.status(400).json({ message: 'text is required' });
    const content = String(text);
    const embedding = await generateEmbedding(content);
    const doc = await insertOne(Tables.COACH_KNOWLEDGE, {
      user_id: (req as any).user?._id || (req as any).user?.id || undefined,
      title: title || "Knowledge entry",
      content,
      type: "text",
      embedding,
    });
    return res.json({ data: doc });
  } catch (e) {
    return res.status(500).json({ message: 'save failed' });
  }
});

// First-time profile save/update
InteractionRoutes.post('/chat/engh/profile', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 30 }), async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id || req.body.userId;
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const { goals, currentWeightKg, strengths, weaknesses, injuryHistory, nutritionPreferences, trainingDaysPerWeek } = req.body || {};
    const doc = await upsert(Tables.USER_PROFILES, {
      user_id: userId,
      goals,
      current_weight_kg: currentWeightKg,
      strengths,
      weaknesses,
      injury_history: injuryHistory,
      nutrition_preferences: nutritionPreferences,
      training_days_per_week: trainingDaysPerWeek,
    }, 'user_id');
    return res.json({ data: doc });
  } catch (e) {
    return res.status(500).json({ message: 'profile save failed' });
  }
});

// Get profile (for onboarding check)
InteractionRoutes.get('/chat/engh/profile', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const doc = await findOne(Tables.USER_PROFILES, { user_id: userId });
    if (!doc) return res.status(404).json({ message: 'not found' });
    return res.json({ data: doc });
  } catch (e) {
    return res.status(500).json({ message: 'profile fetch failed' });
  }
});

export default InteractionRoutes;

// DEV: quick diagnostics to confirm plans exist for current user
InteractionRoutes.get('/debug/plans', ensureAuth as any, async (req, res) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id || (req.query.userId as string);
    if (!userId) return res.status(400).json({ message: 'userId not resolved' });
    const [tp, np, g] = await Promise.all([
      db.from(Tables.TRAINING_PLANS).select('*').eq('user_id', userId).eq('is_current', true).order('version', { ascending: false }).limit(1).maybeSingle().then(r => r.data),
      db.from(Tables.NUTRITION_PLANS).select('*').eq('user_id', userId).eq('is_current', true).order('version', { ascending: false }).limit(1).maybeSingle().then(r => r.data),
      db.from(Tables.GOALS).select('*').eq('user_id', userId).eq('is_current', true).order('version', { ascending: false }).limit(1).maybeSingle().then(r => r.data),
    ]);
    return res.json({ userId, training: tp, nutrition: np, goal: g });
  } catch (e) {
    return res.status(500).json({ message: 'debug failed' });
  }
});

// Create training plan from free-form text sent by the assistant (quick import)
InteractionRoutes.post('/chat/engh/training/from-text', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_ACTIONS_PER_MIN || 30) }), async (req, res) => {
  try {
    const userId: any = (req as any).user?._id || (req as any).user?.id || req.body.userId;
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
        const nextIsEnumeratedOrBullet = /^\s*\d+\./.test(next) || /^\s*[-•]/.test(next);
        if (curLooksLikeName && nextHasNumbers && !nextIsEnumeratedOrBullet) {
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
        // try same merged line first (supports formats like "3x8" or "3 sett x 8 reps")
        const mSame = l.match(/(\d{1,2})\s*(?:sett|set)[^\d]*(\d{1,2})/i) || l.match(/(\d{1,2})\s*[x×]\s*(\d{1,2})/i);
        if (mSame) { sets = Number(mSame[1]); reps = Number(mSame[2]); }
        // search forward within a small lookahead window until next enumerated item
        for (let j=i+1; (!sets || !reps) && j<lines.length && !/^\s*\d+\./.test(lines[j]); j++) {
          const t = lines[j];
          if (banned.test(t)) continue;
          const m = t.match(/(\d{1,2})\s*(?:sett|set)[^\d]*(\d{1,2})/i) || t.match(/(\d{1,2})\s*[x×]\s*(\d{1,2})/i);
          if (m) { sets = Number(m[1]); reps = Number(m[2]); break; }
          const hold = t.match(/(\d{1,2})\s*(?:sett|set)[^\d]*hold/i);
          if (hold) { sets = Number(hold[1]); reps = 10; break; }
        }
        results.push({ name: nameCandidate, sets: sets || 3, reps: reps || 8 });
        if (results.length >= 8) break; // cap hard at 8 to avoid overfilling
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

    // Build sessions from weekday splits; otherwise fall back to Dag-splits or single block
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

    const { data: latest } = await db.from(Tables.TRAINING_PLANS).select('*').eq('user_id', userId).order('version', { ascending: false }).limit(1).maybeSingle();
    const nextVersion = (latest?.version || 0) + 1;
    await updateMany(Tables.TRAINING_PLANS, { user_id: userId, is_current: true }, { is_current: false });
    const created = await insertOne(Tables.TRAINING_PLANS, { user_id: userId, version: nextVersion, is_current: true, sessions, source_text: rawText, guidelines: guidelineLines });
    return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(created?.id) }], message: 'Training plan imported to Assets' });
  } catch (e) {
    console.error('[nutrition/from-text] failed', e);
    const msg = typeof (e as any)?.message === 'string' ? (e as any).message : 'unknown';
    return res.status(500).json({ message: 'import failed', error: msg });
  }
});

// Save training plan (create new version)
InteractionRoutes.post('/chat/engh/training/save', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_ACTIONS_PER_MIN || 30) }), async (req, res) => {
  try {
    const userId: any = (req as any).user?._id || (req as any).user?.id || req.body.userId;
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
    if (!sessions.length) return res.status(400).json({ message: 'sessions required' });
    // Map sessions to versioning model shape
    const days = sessions.map((s: any) => ({ day: s.day, focus: s.focus, exercises: (s.exercises||[]).map((e:any)=>({ name: e.name||e.exercise, sets: e.sets, reps: String(e.reps), rpe: e.rpe })) }));
    const version = await nextTrainingVersion(userId);
    const doc = await insertOne(Tables.TRAINING_PLAN_VERSIONS, { user_id: userId, version, source: 'action', reason: 'Saved via chat', days });
    await upsert(Tables.STUDENT_STATES, { user_id: userId, current_training_plan_version: doc?.id }, 'user_id');
    try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'PLAN_EDIT', summary: `Training v${version} saved`, ref_id: doc?.id, actor: (req as any)?.user?._id || (req as any)?.user?.id, after_data: { version } }); } catch {}
    try { await publish({ type: 'PLAN_UPDATED', user: userId as any }); } catch {}
    return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'training', planId: String(doc?.id) }], message: 'Training plan saved' });
  } catch (e) {
    return res.status(500).json({ message: 'save failed' });
  }
});

// Save nutrition plan (create new version)
InteractionRoutes.post('/chat/engh/nutrition/save', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_ACTIONS_PER_MIN || 30) }), async (req, res) => {
  try {
    const userId: any = (req as any).user?._id || (req as any).user?.id || req.body.userId;
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const { dailyTargets } = req.body || {};
    if (!dailyTargets) return res.status(400).json({ message: 'dailyTargets required' });
    const version = await nextNutritionVersion(userId as any);
    const doc = await insertOne(Tables.NUTRITION_PLAN_VERSIONS, { user_id: userId, version, source: 'action', reason: 'Saved via chat', kcal: dailyTargets.kcal, protein_grams: dailyTargets.protein, carbs_grams: dailyTargets.carbs, fat_grams: dailyTargets.fat });
    await upsert(Tables.STUDENT_STATES, { user_id: userId, current_nutrition_plan_version: doc?.id }, 'user_id');
    try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'NUTRITION_EDIT', summary: `Nutrition v${version} saved`, ref_id: doc?.id, actor: (req as any)?.user?._id || (req as any)?.user?.id, after_data: { version } }); } catch {}
    try { await publish({ type: 'NUTRITION_UPDATED', user: userId as any }); } catch {}
    return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'nutrition', planId: String(doc?.id) }], message: 'Meal plan saved' });
  } catch (e) {
    return res.status(500).json({ message: 'save failed' });
  }
});

// Public share endpoints (JSON)
InteractionRoutes.get('/plans/share/training/:id', async (req, res) => {
  try {
    const plan = await findById(Tables.TRAINING_PLANS, req.params.id);
    if (!plan) return res.status(404).json({ message: 'not found' });
    return res.json({ plan });
  } catch {
    return res.status(500).json({ message: 'share failed' });
  }
});

InteractionRoutes.get('/plans/share/nutrition/:id', async (req, res) => {
  try {
    const plan = await findById(Tables.NUTRITION_PLANS, req.params.id);
    if (!plan) return res.status(404).json({ message: 'not found' });
    return res.json({ plan });
  } catch {
    return res.status(500).json({ message: 'share failed' });
  }
});
// Create nutrition plan from free-form text
InteractionRoutes.post('/chat/engh/nutrition/from-text', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_ACTIONS_PER_MIN || 30) }), async (req, res) => {
  try {
    const userId: any = (req as any).user?._id || (req as any).user?.id || req.body.userId;
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
    // First pass: simple day + "- Meal: item" parser (matches your sample exactly)
    const weekdayLabels = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const weekdayRe = new RegExp(`^\s*(?:#{0,6}\s*)?(?:${weekdayLabels.join('|')})\s*$`, 'i');
    const mealLineRe = /^\s*-\s*(Frokost|Lunsj|Middag|Snack|Breakfast|Lunch|Dinner)\s*:\s*(.+)\s*$/i;
    const canon = (n: string) => (/^Breakfast$/i.test(n) ? 'Frokost' : /^Lunch$/i.test(n) ? 'Lunsj' : /^Dinner$/i.test(n) ? 'Middag' : n);
    const daysParsed: { label:string; meals:{ name:string; items:string[] }[] }[] = [];
    (function trySimpleScan(){
      const lines = normalized.split(/\n/);
      let currentDay: string | null = null;
      const map: Record<string, { name:string; items:string[] }[]> = {};
      for (const raw of lines) {
        const line = String(raw||'').trim();
        if (!line) continue;
        if (weekdayRe.test(line)) { currentDay = line.replace(/^#+\s*/, ''); if (!map[currentDay]) map[currentDay] = []; continue; }
        const mm = line.match(mealLineRe);
        if (mm && currentDay) {
          const label = canon(mm[1]);
          const content = mm[2].trim();
          if (content) {
            let entry = map[currentDay].find(m=>m.name.toLowerCase()===label.toLowerCase());
            if (!entry) { entry = { name: label, items: [] }; map[currentDay].push(entry); }
            entry.items.push(content);
          }
        }
      }
      const keys = Object.keys(map);
      // Only adopt this pass if at least one meal was actually captured
      const hasAnyMeals = keys.some(k => (map[k] || []).length > 0);
      if (keys.length && hasAnyMeals) {
        daysParsed.length = 0;
        for (const k of keys) daysParsed.push({ label: k, meals: map[k] });
      }
    })();

    // Support markdown headings like "#### Day 1" or plain "Day 1"
    const daySplits = normalized.split(/\n\s*#{0,6}\s*(?:Dag|Day)\s*(\d+)\b[^\n]*\n/i);
    // Meal parsing helpers
    const mealHeaderOnlyRe = /^(?:\s*#{0,6}\s*)?\s*(?:[-•]\s*)?(?:\*\*\s*)?(Frokost|Lunsj|Middag|Snack|Breakfast|Lunch|Dinner)(?:\s*\*\*)?\s*:?\s*$/i;
    const mealHeaderWithContentRe = /^(?:\s*#{0,6}\s*)?\s*(?:[-•]\s*)?(?:\*\*\s*)?(Frokost|Lunsj|Middag|Snack|Breakfast|Lunch|Dinner)(?:\s*\*\*)?\s*:?\s*(.+)$/i;
    const dayHeaderRe = /^\s*#{0,6}\s*(?:Dag\s*\d+|Day\s*\d+|Mandag|Tirsdag|Onsdag|Torsdag|Fredag|L(?:ø|o)rdag|S(?:ø|o)ndag)\b.*$/i;
    function parseMealsFromBlock(block: string): { name: string; items: string[] }[] {
      const lines = String(block).split(/\n/);
      const result: { name: string; items: string[] }[] = [];
      let current: string | null = null;
      let buf: string[] = [];
      let preHeaderBuf: string[] = [];
      let seenHeader = false;
      const commit = () => { if (current && buf.length) { result.push({ name: current, items: [...buf] }); } buf = []; };
      for (let raw of lines) {
        const rawStr = String(raw || '');
        const line = rawStr.replace(/^\s*[-•]\s*/, '').trim();
        if (!line) continue;
        if (/^\s*#{1,6}\s/.test(rawStr)) { // generic markdown heading like ### Matplan
          // Treat as a separator within the day: end any current meal and continue
          commit();
          current = null;
          continue;
        }
        if (dayHeaderRe.test(line)) { commit(); current = null; continue; }
        const hc = line.match(mealHeaderWithContentRe);
        if (hc) { // header and content on same line
          if (!seenHeader && preHeaderBuf.length && !result.some(m=>/^Frokost$/i.test(m.name))) {
            result.push({ name: 'Frokost', items: [...preHeaderBuf] });
            preHeaderBuf = [];
          }
          seenHeader = true;
          commit();
          current = canon(hc[1]);
          const firstItem = hc[2].replace(/^\*\*\s*|\s*\*\*$/g, '').trim();
          if (firstItem) buf.push(firstItem);
          continue;
        }
        const ho = line.match(mealHeaderOnlyRe);
        if (ho) {
          if (!seenHeader && preHeaderBuf.length && !result.some(m=>/^Frokost$/i.test(m.name))) {
            result.push({ name: 'Frokost', items: [...preHeaderBuf] });
            preHeaderBuf = [];
          }
          seenHeader = true;
          commit(); current = canon(ho[1]); continue; }
        if (!current) {
          // Only treat pre-header content as Frokost if it looks like likely food items
          const isBullet = /^\s*(?:[-•*–]\s*|\d+\.\s*)/.test(rawStr);
          if (!isBullet) continue; // skip non-bullets until a meal header
          if (!seenHeader) {
            const looksFood = /(,|\d)|\b(havre|havregryn|grøt|grot|egg|yoghurt|brød|brod|knekkebrød|knekkebrod|ost|skyr|smoothie|bær|baer|frukt|banan|korn|gryn)\b/i.test(line);
            if (looksFood) preHeaderBuf.push(line);
          }
          continue;
        }
        // Strip leftover bold markers
        const cleaned = line.replace(/^\*\*\s*|\s*\*\*$/g, '');
        if (cleaned) buf.push(cleaned);
      }
      commit();
      if (!seenHeader && preHeaderBuf.length && !result.some(m=>/^Frokost$/i.test(m.name))) {
        result.push({ name: 'Frokost', items: [...preHeaderBuf] });
      }
      // Ensure unique meal names preserve first occurrence order
      const seen = new Set<string>();
      let out = result.filter(m => (seen.has(m.name) ? false : (seen.add(m.name), true)));
      // Final fallback: if no explicit Frokost was captured, scan lines to collect it
      if (!out.some(m => /^Frokost$/i.test(m.name))) {
        const reHeader = /^(?:\s*#{0,6}\s*)?\s*(?:[-•]\s*)?(?:\*\*\s*)?(Frokost)(?:\s*\*\*)?\s*:?\s*(.*)$/i;
        let foundIdx = -1; let first = '';
        for (let i=0; i<lines.length; i++) {
          const rawStr = String(lines[i] || '');
          const line = rawStr.replace(/^\s*[-•]\s*/, '').trim();
          const m = line.match(reHeader);
          if (m) { foundIdx = i; first = (m[2] || '').trim(); break; }
        }
        if (foundIdx >= 0) {
          const items: string[] = [];
          if (first) items.push(first);
          for (let j = foundIdx + 1; j < lines.length; j++) {
            const rawStr = String(lines[j] || '');
            const asLine = rawStr.replace(/^\s*[-•]\s*/, '').trim();
            if (!asLine) continue;
            if (dayHeaderRe.test(asLine)) break;
            if (mealHeaderOnlyRe.test(asLine) || mealHeaderWithContentRe.test(asLine)) break;
            const cleaned = asLine.replace(/^\*\*\s*|\s*\*\*$/g, '');
            items.push(cleaned);
          }
          if (items.length) out = [{ name: 'Frokost', items }, ...out];
        }
      }
      return out;
    }
    const meals: { name:string; items:string[] }[] = [];
    if (daySplits.length > 1) {
      const parsedByIndex: { label:string; meals:{ name:string; items:string[] }[] }[] = [];
      for (let i=1; i<daySplits.length; i+=2) {
        const label = `Dag ${daySplits[i]}`;
        const block = (daySplits[i+1] || '').split(/\n\s*#?\s*(?:Dag|Day)\s*\d+[^\n]*\n/i)[0];
        const dayMeals = parseMealsFromBlock(block);
        if (dayMeals.length) parsedByIndex.push({ label, meals: dayMeals });
      }
      if (parsedByIndex.length) {
        daysParsed.length = 0;
        daysParsed.push(...parsedByIndex);
      }
    } else {
      // Try splitting by Norwegian weekday headings (Mandag, Tirsdag, ...)
      const weekRe = /^\s*#{0,6}\s*(Mandag|Tirsdag|Onsdag|Torsdag|Fredag|L(?:ø|o)rdag|S(?:ø|o)ndag)\s*:?.*$/gmi;
      type DayPos = { idx:number; label:string; header:string };
      const positions: DayPos[] = [];
      let mm: RegExpExecArray | null;
      while ((mm = weekRe.exec(normalized)) !== null) {
        positions.push({ idx: mm.index ?? 0, label: mm[1], header: mm[0] });
      }
      if (positions.length) {
        const parsedByWeek: { label:string; meals:{ name:string; items:string[] }[] }[] = [];
        for (let i=0; i<positions.length; i++) {
          const start = positions[i].idx + positions[i].header.length;
          const end = i+1 < positions.length ? positions[i+1].idx : normalized.length;
          const body = normalized.slice(start, end);
          const dayMeals = parseMealsFromBlock(body);
          if (dayMeals.length) parsedByWeek.push({ label: positions[i].label, meals: dayMeals });
        }
        if (parsedByWeek.length) {
          if (!daysParsed.length || daysParsed.every(d => (d.meals||[]).length === 0)) {
            daysParsed.length = 0;
            daysParsed.push(...parsedByWeek);
          }
        }
      }
      // single generic block → collect meals without day labels
      meals.push(...parseMealsFromBlock(text));
    }
    // Extract global guidelines (outside day sections) so they don't get merged into any day's Snack
    const guidelines = normalized.split(/\n/)
      .map(l=>l.trim())
      .filter(l=>/^[-•]\s/.test(l) && /(Hydrering|Husk|Juster|Justering|Variasjon|Varier|Forberedelse|General\s*Tips|Generelle\s*Tips|Hvis du har)/i.test(l))
      .map(l=>l.replace(/^[-•]\s*/, ''));

    // If no explicit day sections were found but a single-day meal list exists,
    // duplicate that template across all 7 days so the UI shows a full week.
    if (!daysParsed.length && meals.length) {
      const cloneMeals = (arr: { name: string; items: string[] }[]) => arr.map(m => ({ name: m.name, items: [...m.items] }));
      const labels = ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'];
      for (const label of labels) {
        daysParsed.push({ label, meals: cloneMeals(meals) });
      }
    }

    const { data: latest } = await db.from(Tables.NUTRITION_PLANS).select('*').eq('user_id', userId).order('version', { ascending: false }).limit(1).maybeSingle();
    const nextVersion = (latest?.version || 0) + 1;
    await updateMany(Tables.NUTRITION_PLANS, { user_id: userId, is_current: true }, { is_current: false });
    const created = await insertOne(Tables.NUTRITION_PLANS, { user_id: userId, version: nextVersion, is_current: true, daily_targets: { kcal, protein, carbs, fat }, notes: '', source_text: text, meals: meals.length?meals:undefined, guidelines, days: daysParsed.length?daysParsed:undefined });
    return res.json({ actions: [{ type: 'PLAN_CREATE', area: 'nutrition', planId: String(created?.id) }], message: 'Meal plan imported to Assets' });
  } catch (e) {
    console.error('[nutrition/from-text] failed', e);
    return res.status(500).json({ message: 'import failed' });
  }
});

// Create simple goal from free-form text
InteractionRoutes.post('/chat/engh/goals/from-text', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_ACTIONS_PER_MIN || 30) }), async (req, res) => {
  try {
    const userId: any = (req as any).user?._id || (req as any).user?.id || req.body.userId;
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
    const { data: latest } = await db.from(Tables.GOALS).select('*').eq('user_id', userId).order('version', { ascending: false }).limit(1).maybeSingle();
    const nextVersion = (latest?.version || 0) + 1;
    await updateMany(Tables.GOALS, { user_id: userId, is_current: true }, { is_current: false });
    const created = await insertOne(Tables.GOALS, { user_id: userId, version: nextVersion, is_current: true, target_weight_kg: targetWeight, strength_targets: strength, horizon_weeks: horizon, source_text: text, calories_daily_deficit: deficit, weekly_weight_loss_kg: weeklyLoss, weekly_exercise_minutes: weeklyMinutes, hydration_liters: hydration, plan });
    try {
      await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: 'GOAL_EDIT', summary: 'Goal imported from text', actor: (req as any)?.user?._id || (req as any)?.user?.id, after_data: { goal_id: created?.id, version: nextVersion } });
      await publish({ type: 'GOAL_UPDATED', user: userId as any });
    } catch {}
    return res.json({ actions: [{ type: 'GOAL_SET', goalId: String(created?.id) }], message: 'Goal imported to Assets' });
  } catch (e) {
    return res.status(500).json({ message: 'import failed' });
  }
});
