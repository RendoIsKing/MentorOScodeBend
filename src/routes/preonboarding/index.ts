import { Router } from "express";
import Profile from "../../models/Profile";
import { User } from "../../app/Models/User";
import PlanPreview from "../../models/PlanPreview";
import { generateDeterministicPreview } from "../../services/preview/generatePlanPreview";
import TrainingPlanVersion from "../../models/TrainingPlanVersion";
import NutritionPlanVersion from "../../models/NutritionPlanVersion";
import StudentState from "../../models/StudentState";
import StudentSnapshot from "../../models/StudentSnapshot";
import { publish } from "../../services/events/publish";
import ChangeEvent from "../../models/ChangeEvent";

const r = Router();

function collectedPercentOf(p: any): number {
  const total = 6;
  let have = 0;
  if (p?.goals) have++;
  if (p?.experienceLevel) have++;
  if (p?.bodyWeightKg) have++;
  if (p?.diet) have++;
  if (p?.schedule?.daysPerWeek) have++;
  if (Array.isArray(p?.injuries)) have++;
  return Math.round((have / total) * 100);
}

r.post("/start", async (req: any, res) => {
  const userId = req.user?._id || req.body.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { status: "VISITOR" } },
    { new: true }
  );

  let profile = await Profile.findOne({ user: userId });
  if (!profile) profile = await Profile.create({ user: userId });

  return res.json({
    ok: true,
    firstMessage:
      "Hei! Jeg er Coach Engh. Fortell meg kort hva du vil oppnå – så lager jeg et første forslag skreddersydd for deg.",
    status: (user as any)?.status,
  });
});

r.post("/message", async (req: any, res) => {
  const userId = req.user?._id || req.body.userId;
  const { message, patch } = req.body as { message: string; patch?: any };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let profile = await Profile.findOne({ user: userId });
  if (!profile) profile = await Profile.create({ user: userId });

  if (patch?.injuries && !(profile.consentFlags?.healthData === true)) {
    return res.status(400).json({ error: "Consent required to store injuries" });
  }

  await Profile.updateOne(
    { user: userId },
    { $set: { ...patch } },
    { upsert: true }
  );
  profile = await Profile.findOne({ user: userId });
  const collected = collectedPercentOf(profile);
  await Profile.updateOne({ user: userId }, { $set: { collectedPercent: collected } });

  await User.updateOne({ _id: userId }, { $set: { status: "LEAD" } });

  let previewGenerated = false;
  if (collected >= 80) {
    const preview = generateDeterministicPreview({ userId, profile });
    await PlanPreview.findOneAndUpdate(
      { user: userId },
      { $set: preview },
      { upsert: true }
    );
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

r.post("/consent", async (req: any, res) => {
  const userId = req.user?._id || req.body.userId;
  const { healthData } = req.body as { healthData: boolean };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const now = new Date();
  await Profile.updateOne(
    { user: userId },
    { $set: { "consentFlags.healthData": !!healthData, "consentFlags.timestamp": now } },
    { upsert: true }
  );
  return res.json({ ok: true, consented: !!healthData, timestamp: now.toISOString() });
});

r.get("/preview", async (req: any, res) => {
  const userId = req.user?._id || req.query.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const preview = await PlanPreview.findOne({ user: userId });
  if (!preview) return res.status(404).json({ error: "No preview yet" });
  return res.json({ ok: true, preview });
});

r.post("/convert", async (req: any, res) => {
  const userId = req.user?._id || req.body.userId;
  const { planType } = req.body as { planType: "TRIAL" | "SUBSCRIBED" };
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await User.updateOne({ _id: userId }, { $set: { status: planType === "TRIAL" ? "TRIAL" : "SUBSCRIBED" } });
  try {
    const preview = await PlanPreview.findOne({ user: userId }).lean();
    if (preview) {
      const tp = await TrainingPlanVersion.create({ user: userId, version: 1, source: "preview", reason: "Initialized from preview", days: preview.trainingWeek as any });
      const np = await NutritionPlanVersion.create({ user: userId, version: 1, source: "preview", reason: "Initialized from preview", kcal: preview.nutrition.kcal, proteinGrams: preview.nutrition.proteinGrams, carbsGrams: preview.nutrition.carbsGrams, fatGrams: preview.nutrition.fatGrams });
      await StudentState.findOneAndUpdate({ user: userId }, { $set: { currentTrainingPlanVersion: tp._id, currentNutritionPlanVersion: np._id } }, { upsert: true });
      // Build initial snapshot (idempotent: keep one per user)
      const daysPerWeek = Array.isArray((tp as any)?.days) ? ((tp as any).days.filter((d:any)=> (d.exercises||[]).length > 0).length || (tp as any).days.length || 0) : 0;
      const snapshot = await StudentSnapshot.findOneAndUpdate(
        { user: userId },
        {
          $setOnInsert: {
            weightSeries: [],
            trainingPlanSummary: { daysPerWeek },
            nutritionSummary: { kcal: (np as any)?.kcal, protein: (np as any)?.proteinGrams, carbs: (np as any)?.carbsGrams, fat: (np as any)?.fatGrams },
            kpis: { adherence7d: 0 },
          },
        },
        { new: true, upsert: true }
      );
      try { await ChangeEvent.create({ user: userId, type: "PLAN_EDIT", summary: "Initialized from preview", refId: tp._id }); } catch {}
      try { await ChangeEvent.create({ user: userId, type: "NUTRITION_EDIT", summary: "Initialized from preview", refId: np._id }); } catch {}
      await publish({ type: "PLAN_UPDATED", user: userId });
      await publish({ type: "NUTRITION_UPDATED", user: userId });
      return res.status(200).json({ ok: true, activated: true, snapshotId: String(snapshot?._id || "") });
    }
  } catch {}
  res.json({ ok: true, activated: true });
});

// Dev/test helper: force entitlement and refresh session user
r.post("/force-sub", async (req: any, res) => {
  try {
    const userId = req.user?._id || req.body.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    await (User as any).updateOne({ _id: userId }, { $set: { status: "SUBSCRIBED" } });
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
  const userId = req.user?._id || req.query.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const user = await (User as any).findById(userId);
  const profile = await Profile.findOne({ user: userId });
  const preview = await PlanPreview.findOne({ user: userId });

  return res.json({
    ok: true,
    status: user?.status ?? "VISITOR",
    collectedFieldsPercent: profile?.collectedPercent ?? 0,
    previewReady: !!preview,
  });
});

export default r;


