import { Router } from "express";
import { db, findOne, findById, insertOne, updateById, upsert, Tables } from "../../lib/db";
import { generateDeterministicPreview } from "../../services/preview/generatePlanPreview";
import { publish } from "../../services/events/publish";
import { validateZod } from "../../app/Middlewares";
import { z } from "zod";
import { nonEmptyString, objectId } from "../../app/Validation/requestSchemas";

const r = Router();

const userIdSchema = z.object({ userId: objectId.optional() }).strict();
const messageSchema = z.object({
  userId: objectId.optional(),
  message: nonEmptyString,
  patch: z.record(z.any()).optional(),
}).strict();
const consentSchema = z.object({
  userId: objectId.optional(),
  healthData: z.boolean(),
}).strict();
const convertSchema = z.object({
  userId: objectId.optional(),
  planType: z.enum(["TRIAL", "SUBSCRIBED"]),
}).strict();

function collectedPercentOf(p: any): number {
  const total = 6;
  let have = 0;
  if (p?.goals) have++;
  if (p?.experience_level || p?.experienceLevel) have++;
  if (p?.body_weight_kg || p?.bodyWeightKg) have++;
  if (p?.diet) have++;
  if (p?.schedule?.days_per_week || p?.schedule?.daysPerWeek) have++;
  if (Array.isArray(p?.injuries)) have++;
  return Math.round((have / total) * 100);
}

r.post("/start", validateZod({ body: userIdSchema }), async (req: any, res) => {
  const userId = req.user?.id || req.user?._id || req.body.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await updateById(Tables.USERS, userId, { status: "VISITOR" });

  let profile = await findOne(Tables.PROFILES, { user_id: userId });
  if (!profile) profile = await insertOne(Tables.PROFILES, { user_id: userId });

  return res.json({
    ok: true,
    firstMessage:
      "Hei! Jeg er Coach Engh. Fortell meg kort hva du vil oppnå – så lager jeg et første forslag skreddersydd for deg.",
    status: user?.status,
  });
});

r.post("/message", validateZod({ body: messageSchema }), async (req: any, res) => {
  const userId = req.user?.id || req.user?._id || req.body.userId;
  const { message, patch } = req.body as { message: string; patch?: any };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let profile = await findOne(Tables.PROFILES, { user_id: userId });
  if (!profile) profile = await insertOne(Tables.PROFILES, { user_id: userId });

  if (patch?.injuries && !(profile?.consent_flags?.healthData === true)) {
    return res.status(400).json({ error: "Consent required to store injuries" });
  }

  // Upsert profile with the patch fields
  await upsert(Tables.PROFILES, { user_id: userId, ...patch }, "user_id");
  profile = await findOne(Tables.PROFILES, { user_id: userId });
  const collected = collectedPercentOf(profile);
  await db.from(Tables.PROFILES).update({ collected_percent: collected }).eq("user_id", userId);

  await updateById(Tables.USERS, userId, { status: "LEAD" });

  let previewGenerated = false;
  if (collected >= 80) {
    const preview = generateDeterministicPreview({ userId, profile });
    await upsert(Tables.PLAN_PREVIEWS, { user_id: userId, ...preview }, "user_id");
    previewGenerated = true;
  }

  return res.json({
    ok: true,
    messageEcho: message,
    collectedPercent: collected,
    next: previewGenerated
      ? { type: "PREVIEW_READY", cta: ["BEGIN_TRIAL", "CHECKOUT"] }
      : { type: "QUESTION", prompt: "Hva veier du ca. nå, og hvor mange dager i uken ønsker du å trene?" },
  });
});

r.post("/consent", validateZod({ body: consentSchema }), async (req: any, res) => {
  const userId = req.user?.id || req.user?._id || req.body.userId;
  const { healthData } = req.body as { healthData: boolean };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const now = new Date();
  await upsert(
    Tables.PROFILES,
    {
      user_id: userId,
      consent_flags: { healthData: !!healthData, timestamp: now.toISOString() },
    },
    "user_id"
  );
  return res.json({ ok: true, consented: !!healthData, timestamp: now.toISOString() });
});

r.get("/preview", async (req: any, res) => {
  const userId = req.user?.id || req.user?._id || req.query.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const preview = await findOne(Tables.PLAN_PREVIEWS, { user_id: userId });
  if (!preview) return res.status(404).json({ error: "No preview yet" });
  return res.json({ ok: true, preview });
});

r.post("/convert", validateZod({ body: convertSchema }), async (req: any, res) => {
  const userId = req.user?.id || req.user?._id || req.body.userId;
  const { planType } = req.body as { planType: "TRIAL" | "SUBSCRIBED" };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await updateById(Tables.USERS, userId, { status: planType === "TRIAL" ? "TRIAL" : "SUBSCRIBED" });
  try {
    const preview = await findOne<any>(Tables.PLAN_PREVIEWS, { user_id: userId });
    if (preview) {
      const tp = await insertOne<any>(Tables.TRAINING_PLAN_VERSIONS, {
        user_id: userId,
        version: 1,
        source: "preview",
        reason: "Initialized from preview",
        days: preview.training_week || preview.trainingWeek,
      });
      const np = await insertOne<any>(Tables.NUTRITION_PLAN_VERSIONS, {
        user_id: userId,
        version: 1,
        source: "preview",
        reason: "Initialized from preview",
        kcal: preview.nutrition?.kcal,
        protein_grams: preview.nutrition?.proteinGrams || preview.nutrition?.protein_grams,
        carbs_grams: preview.nutrition?.carbsGrams || preview.nutrition?.carbs_grams,
        fat_grams: preview.nutrition?.fatGrams || preview.nutrition?.fat_grams,
      });
      await upsert(
        Tables.STUDENT_STATES,
        {
          user_id: userId,
          current_training_plan_version: tp?.id,
          current_nutrition_plan_version: np?.id,
        },
        "user_id"
      );
      // Build initial snapshot (idempotent: keep one per user)
      const daysPerWeek = Array.isArray(tp?.days)
        ? (tp.days.filter((d: any) => (d.exercises || []).length > 0).length || tp.days.length || 0)
        : 0;
      const snapshot = await upsert<any>(
        Tables.STUDENT_SNAPSHOTS,
        {
          user_id: userId,
          weight_series: [],
          training_plan_summary: { daysPerWeek },
          nutrition_summary: {
            kcal: np?.kcal,
            protein: np?.protein_grams,
            carbs: np?.carbs_grams,
            fat: np?.fat_grams,
          },
          kpis: { adherence7d: 0 },
        },
        "user_id"
      );
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: "PLAN_EDIT", summary: "Initialized from preview", ref_id: tp?.id }); } catch {}
      try { await insertOne(Tables.CHANGE_EVENTS, { user_id: userId, type: "NUTRITION_EDIT", summary: "Initialized from preview", ref_id: np?.id }); } catch {}
      await publish({ type: "PLAN_UPDATED", user: userId });
      await publish({ type: "NUTRITION_UPDATED", user: userId });
      return res.status(200).json({ ok: true, activated: true, snapshotId: String(snapshot?.id || "") });
    }
  } catch {}
  return res.json({ ok: true, activated: true });
});

// Dev/test helper: force entitlement and refresh session user
r.post("/force-sub", validateZod({ body: userIdSchema }), async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.body.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await updateById(Tables.USERS, userId, { status: "SUBSCRIBED" });
    try {
      // Reflect immediately in request context
      if (req.user) (req.user as any).status = "SUBSCRIBED";
      // If using express-session, ensure session user id is set
      if (req.session) {
        req.session.user = { id: String(userId) };
      }
    } catch {}
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "failed" });
  }
});

r.get("/state", async (req: any, res) => {
  const userId = req.user?.id || req.user?._id || req.query.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await findById(Tables.USERS, userId);
  const profile = await findOne(Tables.PROFILES, { user_id: userId });
  const preview = await findOne(Tables.PLAN_PREVIEWS, { user_id: userId });

  return res.json({
    ok: true,
    status: user?.status ?? "VISITOR",
    collectedFieldsPercent: profile?.collected_percent ?? 0,
    previewReady: !!preview,
  });
});

export default r;
