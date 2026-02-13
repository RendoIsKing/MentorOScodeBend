import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth as ensureAuth, validateZod } from "../app/Middlewares";
import { Types } from "mongoose";
import { UserInterface } from "../types/UserInterface";
import { TrainingPlan, NutritionPlan, Goal } from "../app/Models/PlanModels";
import { SubscriptionPlan } from "../app/Models/SubscriptionPlan";
import { Subscription } from "../app/Models/Subscription";
import { WeightEntry } from "../app/Models/WeightEntry";
import ChangeEvent from "../models/ChangeEvent";
import { publish } from "../services/events/publish";
import { objectIdParam } from "../app/Validation/requestSchemas";

const CoachPlansRoutes: Router = Router();

/* ─── Zod schemas ──────────────────────────────────── */

const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sets: z.number().int().min(1).max(100),
  reps: z.number().int().min(1).max(1000),
  load: z.number().min(0).max(10000).optional(),
});

const sessionSchema = z.object({
  day: z.string().trim().min(1).max(50),
  focus: z.string().trim().min(1).max(200),
  exercises: z.array(exerciseSchema).min(1).max(50),
  notes: z.array(z.string().max(500)).max(20).optional(),
});

const trainingPlanSchema = z.object({
  sessions: z.array(sessionSchema).min(1).max(14),
  guidelines: z.array(z.string().max(500)).max(20).optional(),
});

const mealSchema = z.object({
  name: z.string().trim().min(1).max(200),
  items: z.array(z.string().max(500)).min(1).max(50),
});

const daySchema = z.object({
  label: z.string().trim().min(1).max(100),
  meals: z.array(mealSchema).min(1).max(20),
});

const nutritionPlanSchema = z.object({
  dailyTargets: z.object({
    kcal: z.number().min(0).max(20000),
    protein: z.number().min(0).max(2000),
    carbs: z.number().min(0).max(5000),
    fat: z.number().min(0).max(2000),
  }),
  meals: z.array(mealSchema).max(20).optional(),
  days: z.array(daySchema).max(14).optional(),
  guidelines: z.array(z.string().max(500)).max(20).optional(),
});

/* ─── Helper: verify coach-client relationship ───── */

async function verifyCoachClient(coachId: string, clientId: string): Promise<boolean> {
  const plans = await SubscriptionPlan.find({ userId: coachId, isDeleted: false }).select("_id").lean();
  if (plans.length === 0) return false;
  const planIds = plans.map((p) => p._id);
  const sub = await Subscription.findOne({
    userId: new Types.ObjectId(clientId),
    planId: { $in: planIds.map((id) => new Types.ObjectId(id)) },
    status: "active",
  }).lean();
  return !!sub;
}

/* ─── Training Plan Endpoints ──────────────────────── */

// PUT /coach-plans/:clientId/training — Create or update training plan
CoachPlansRoutes.put(
  "/:clientId/training",
  ensureAuth as any,
  validateZod({ params: objectIdParam("clientId"), body: trainingPlanSchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { sessions, guidelines } = req.body;

      // Get latest version number
      const latest = await TrainingPlan.findOne({ userId: new Types.ObjectId(clientId) })
        .sort({ version: -1 })
        .select("version")
        .lean();
      const nextVersion = ((latest as any)?.version || 0) + 1;

      // Mark all previous as not current
      await TrainingPlan.updateMany(
        { userId: new Types.ObjectId(clientId), isCurrent: true },
        { $set: { isCurrent: false } }
      );

      // Create new plan
      const plan = await TrainingPlan.create({
        userId: new Types.ObjectId(clientId),
        version: nextVersion,
        isCurrent: true,
        sessions,
        guidelines: guidelines || [],
      });

      // Log change event
      try {
        await ChangeEvent.create({
          user: new Types.ObjectId(clientId),
          type: "PLAN_EDIT",
          summary: `Treningsplan v${nextVersion} opprettet av coach`,
          actor: new Types.ObjectId(coachId),
          after: { version: nextVersion, sessionCount: sessions.length },
        });
      } catch (err) {
        console.error("[coach-plans] Failed to log change event:", err);
      }

      return res.status(200).json({
        plan: {
          id: String(plan._id),
          version: nextVersion,
          sessions: plan.sessions,
          guidelines: plan.guidelines,
        },
      });
    } catch (err) {
      console.error("[coach-plans] Failed to save training plan:", err);
      return res.status(500).json({ message: "Kunne ikke lagre treningsplan." });
    }
  }
);

// GET /coach-plans/:clientId/training — Get current training plan
CoachPlansRoutes.get(
  "/:clientId/training",
  ensureAuth as any,
  validateZod({ params: objectIdParam("clientId") }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const plan = await TrainingPlan.findOne({
        userId: new Types.ObjectId(clientId),
        isCurrent: true,
      })
        .sort({ version: -1 })
        .lean();

      if (!plan) return res.json({ plan: null });

      return res.json({
        plan: {
          id: String((plan as any)._id),
          version: (plan as any).version,
          sessions: (plan as any).sessions,
          guidelines: (plan as any).guidelines || [],
        },
      });
    } catch (err) {
      console.error("[coach-plans] Failed to get training plan:", err);
      return res.status(500).json({ message: "Kunne ikke hente treningsplan." });
    }
  }
);

/* ─── Nutrition Plan Endpoints ─────────────────────── */

// PUT /coach-plans/:clientId/nutrition — Create or update nutrition plan
CoachPlansRoutes.put(
  "/:clientId/nutrition",
  ensureAuth as any,
  validateZod({ params: objectIdParam("clientId"), body: nutritionPlanSchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { dailyTargets, meals, days, guidelines } = req.body;

      // Get latest version
      const latest = await NutritionPlan.findOne({ userId: new Types.ObjectId(clientId) })
        .sort({ version: -1 })
        .select("version")
        .lean();
      const nextVersion = ((latest as any)?.version || 0) + 1;

      // Mark previous as not current
      await NutritionPlan.updateMany(
        { userId: new Types.ObjectId(clientId), isCurrent: true },
        { $set: { isCurrent: false } }
      );

      // Create new plan
      const plan = await NutritionPlan.create({
        userId: new Types.ObjectId(clientId),
        version: nextVersion,
        isCurrent: true,
        dailyTargets,
        meals: meals || [],
        days: days || [],
        guidelines: guidelines || [],
      });

      // Log change event
      try {
        await ChangeEvent.create({
          user: new Types.ObjectId(clientId),
          type: "NUTRITION_EDIT",
          summary: `Ernæringsplan v${nextVersion} opprettet av coach (${dailyTargets.kcal} kcal)`,
          actor: new Types.ObjectId(coachId),
          after: { version: nextVersion, dailyTargets },
        });
      } catch (err) {
        console.error("[coach-plans] Failed to log change event:", err);
      }

      return res.status(200).json({
        plan: {
          id: String(plan._id),
          version: nextVersion,
          dailyTargets: plan.dailyTargets,
          meals: plan.meals,
          days: plan.days,
          guidelines: plan.guidelines,
        },
      });
    } catch (err) {
      console.error("[coach-plans] Failed to save nutrition plan:", err);
      return res.status(500).json({ message: "Kunne ikke lagre ernæringsplan." });
    }
  }
);

// GET /coach-plans/:clientId/nutrition — Get current nutrition plan
CoachPlansRoutes.get(
  "/:clientId/nutrition",
  ensureAuth as any,
  validateZod({ params: objectIdParam("clientId") }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const plan = await NutritionPlan.findOne({
        userId: new Types.ObjectId(clientId),
        isCurrent: true,
      })
        .sort({ version: -1 })
        .lean();

      if (!plan) return res.json({ plan: null });

      return res.json({
        plan: {
          id: String((plan as any)._id),
          version: (plan as any).version,
          dailyTargets: (plan as any).dailyTargets,
          meals: (plan as any).meals || [],
          days: (plan as any).days || [],
          guidelines: (plan as any).guidelines || [],
        },
      });
    } catch (err) {
      console.error("[coach-plans] Failed to get nutrition plan:", err);
      return res.status(500).json({ message: "Kunne ikke hente ernæringsplan." });
    }
  }
);

/* ─── Weight Management Endpoints ──────────────────── */

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const weightLogSchema = z.object({
  date: IsoDate,
  kg: z.number().min(20).max(500),
});

const weightDeleteSchema = z.object({
  date: IsoDate,
});

// GET /coach-plans/:clientId/weights?period=90d — Get weight history
CoachPlansRoutes.get(
  "/:clientId/weights",
  ensureAuth as any,
  validateZod({ params: objectIdParam("clientId") }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const periodDays = Number(req.query.days) || 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const entries = await WeightEntry.find({
        userId: new Types.ObjectId(clientId),
        date: { $gte: startDate.toISOString().slice(0, 10) },
      })
        .sort({ date: 1 })
        .select("date kg -_id")
        .lean();

      return res.json({ weights: entries });
    } catch (err) {
      console.error("[coach-plans] Failed to get weights:", err);
      return res.status(500).json({ message: "Kunne ikke hente vektdata." });
    }
  }
);

// POST /coach-plans/:clientId/weights — Log weight for client
CoachPlansRoutes.post(
  "/:clientId/weights",
  ensureAuth as any,
  validateZod({ params: objectIdParam("clientId"), body: weightLogSchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { date, kg } = req.body;

      // Validate date not in future
      const todayIso = new Date().toISOString().slice(0, 10);
      if (date > todayIso) {
        return res.status(400).json({ message: "Dato kan ikke være i fremtiden." });
      }

      await WeightEntry.updateOne(
        { userId: new Types.ObjectId(clientId), date },
        { $set: { kg } },
        { upsert: true }
      );

      try {
        await ChangeEvent.create({
          user: new Types.ObjectId(clientId),
          type: "WEIGHT_LOG",
          summary: `Vekt ${kg} kg registrert (${date}) av coach`,
          actor: new Types.ObjectId(coachId),
          after: { date, kg },
        });
        await publish({ type: "WEIGHT_LOGGED", user: new Types.ObjectId(clientId) as any, date, kg });
      } catch (err) {
        console.error("[coach-plans] Failed to log weight change event:", err);
      }

      return res.status(200).json({ ok: true, date, kg });
    } catch (err) {
      console.error("[coach-plans] Failed to log weight:", err);
      return res.status(500).json({ message: "Kunne ikke registrere vekt." });
    }
  }
);

// DELETE /coach-plans/:clientId/weights?date=YYYY-MM-DD — Delete weight entry
CoachPlansRoutes.delete(
  "/:clientId/weights",
  ensureAuth as any,
  validateZod({ params: objectIdParam("clientId"), query: weightDeleteSchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      const date = req.query.date as string;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      await WeightEntry.deleteOne({ userId: new Types.ObjectId(clientId), date });

      try {
        await ChangeEvent.create({
          user: new Types.ObjectId(clientId),
          type: "WEIGHT_LOG",
          summary: `Vektregistrering for ${date} slettet av coach`,
          actor: new Types.ObjectId(coachId),
        });
      } catch (err) {
        console.error("[coach-plans] Failed to log weight delete event:", err);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[coach-plans] Failed to delete weight:", err);
      return res.status(500).json({ message: "Kunne ikke slette vektregistrering." });
    }
  }
);

/* ─── Goal Management Endpoints ────────────────────── */

const goalSchema = z.object({
  targetWeightKg: z.number().min(20).max(500).optional(),
  strengthTargets: z.string().max(500).optional(),
  horizonWeeks: z.number().int().min(1).max(260).optional(),
});

// PUT /coach-plans/:clientId/goal — Create or update goal
CoachPlansRoutes.put(
  "/:clientId/goal",
  ensureAuth as any,
  validateZod({ params: objectIdParam("clientId"), body: goalSchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { targetWeightKg, strengthTargets, horizonWeeks } = req.body;

      const latest = await Goal.findOne({ userId: new Types.ObjectId(clientId) })
        .sort({ version: -1 })
        .select("version")
        .lean();
      const nextVersion = ((latest as any)?.version || 0) + 1;

      await Goal.updateMany(
        { userId: new Types.ObjectId(clientId), isCurrent: true },
        { $set: { isCurrent: false } }
      );

      const goal = await Goal.create({
        userId: new Types.ObjectId(clientId),
        version: nextVersion,
        isCurrent: true,
        targetWeightKg,
        strengthTargets,
        horizonWeeks,
      });

      try {
        const parts: string[] = [];
        if (targetWeightKg) parts.push(`${targetWeightKg} kg`);
        if (strengthTargets) parts.push(strengthTargets);
        if (horizonWeeks) parts.push(`${horizonWeeks} uker`);
        await ChangeEvent.create({
          user: new Types.ObjectId(clientId),
          type: "GOAL_EDIT",
          summary: `Mål oppdatert av coach: ${parts.join(", ")}`,
          actor: new Types.ObjectId(coachId),
          after: { targetWeightKg, strengthTargets, horizonWeeks },
        });
      } catch (err) {
        console.error("[coach-plans] Failed to log goal change:", err);
      }

      return res.json({
        goal: {
          targetWeightKg: (goal as any).targetWeightKg,
          strengthTargets: (goal as any).strengthTargets,
          horizonWeeks: (goal as any).horizonWeeks,
          version: nextVersion,
        },
      });
    } catch (err) {
      console.error("[coach-plans] Failed to save goal:", err);
      return res.status(500).json({ message: "Kunne ikke lagre mål." });
    }
  }
);

export default CoachPlansRoutes;
