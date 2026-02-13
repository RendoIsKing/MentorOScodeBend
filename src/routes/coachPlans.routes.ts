import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth as ensureAuth, validateZod } from "../app/Middlewares";
import { Types } from "mongoose";
import { UserInterface } from "../types/UserInterface";
import { TrainingPlan, NutritionPlan } from "../app/Models/PlanModels";
import { SubscriptionPlan } from "../app/Models/SubscriptionPlan";
import { Subscription } from "../app/Models/Subscription";
import ChangeEvent from "../models/ChangeEvent";
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

export default CoachPlansRoutes;
