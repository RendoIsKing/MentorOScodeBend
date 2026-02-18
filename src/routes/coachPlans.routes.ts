import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth as ensureAuth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne } from "../lib/db";
import { UserInterface } from "../types/UserInterface";

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
  const { data: plans } = await db
    .from(Tables.SUBSCRIPTION_PLANS)
    .select("id")
    .eq("user_id", coachId)
    .eq("is_deleted", false);
  if (!plans || plans.length === 0) return false;

  const planIds = plans.map((p: any) => p.id);
  const { data: sub } = await db
    .from(Tables.SUBSCRIPTIONS)
    .select("id")
    .in("plan_id", planIds)
    .eq("user_id", clientId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return !!sub;
}

/* ─── Training Plan Endpoints ──────────────────────── */

CoachPlansRoutes.put(
  "/:clientId/training",
  ensureAuth as any,
  validateZod({ body: trainingPlanSchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { sessions, guidelines } = req.body;

      const { data: latest } = await db
        .from(Tables.TRAINING_PLANS)
        .select("version")
        .eq("user_id", clientId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((latest as any)?.version || 0) + 1;

      await db
        .from(Tables.TRAINING_PLANS)
        .update({ is_current: false })
        .eq("user_id", clientId)
        .eq("is_current", true);

      const plan = await insertOne(Tables.TRAINING_PLANS, {
        user_id: clientId,
        version: nextVersion,
        is_current: true,
        sessions,
        guidelines: guidelines || [],
      });

      if (!plan) return res.status(500).json({ message: "Kunne ikke lagre treningsplan." });

      try {
        await insertOne(Tables.CHANGE_EVENTS, {
          user_id: clientId,
          type: "PLAN_EDIT",
          summary: `Treningsplan v${nextVersion} opprettet av coach`,
          actor: { id: coachId, role: "coach" },
          after_data: { version: nextVersion, sessionCount: sessions.length },
        });
      } catch {}

      return res.json({
        plan: { id: plan.id, version: nextVersion, sessions: plan.sessions, guidelines: plan.guidelines },
      });
    } catch (err) {
      console.error("[coach-plans] training save error:", err);
      return res.status(500).json({ message: "Kunne ikke lagre treningsplan." });
    }
  }
);

CoachPlansRoutes.get(
  "/:clientId/training",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { data: plan } = await db
        .from(Tables.TRAINING_PLANS)
        .select("*")
        .eq("user_id", clientId)
        .eq("is_current", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!plan) return res.json({ plan: null });

      return res.json({
        plan: { id: plan.id, version: plan.version, sessions: plan.sessions, guidelines: plan.guidelines || [] },
      });
    } catch (err) {
      console.error("[coach-plans] training get error:", err);
      return res.status(500).json({ message: "Kunne ikke hente treningsplan." });
    }
  }
);

/* ─── Nutrition Plan Endpoints ─────────────────────── */

CoachPlansRoutes.put(
  "/:clientId/nutrition",
  ensureAuth as any,
  validateZod({ body: nutritionPlanSchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { dailyTargets, meals, days, guidelines } = req.body;

      const { data: latest } = await db
        .from(Tables.NUTRITION_PLANS)
        .select("version")
        .eq("user_id", clientId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((latest as any)?.version || 0) + 1;

      await db
        .from(Tables.NUTRITION_PLANS)
        .update({ is_current: false })
        .eq("user_id", clientId)
        .eq("is_current", true);

      const plan = await insertOne(Tables.NUTRITION_PLANS, {
        user_id: clientId,
        version: nextVersion,
        is_current: true,
        daily_targets: dailyTargets,
        meals: meals || [],
        days: days || [],
        guidelines: guidelines || [],
      });

      if (!plan) return res.status(500).json({ message: "Kunne ikke lagre ernæringsplan." });

      try {
        await insertOne(Tables.CHANGE_EVENTS, {
          user_id: clientId,
          type: "NUTRITION_EDIT",
          summary: `Ernæringsplan v${nextVersion} opprettet av coach (${dailyTargets.kcal} kcal)`,
          actor: { id: coachId, role: "coach" },
          after_data: { version: nextVersion, dailyTargets },
        });
      } catch {}

      return res.json({
        plan: {
          id: plan.id,
          version: nextVersion,
          dailyTargets: plan.daily_targets,
          meals: plan.meals,
          days: plan.days,
          guidelines: plan.guidelines,
        },
      });
    } catch (err) {
      console.error("[coach-plans] nutrition save error:", err);
      return res.status(500).json({ message: "Kunne ikke lagre ernæringsplan." });
    }
  }
);

CoachPlansRoutes.get(
  "/:clientId/nutrition",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { data: plan } = await db
        .from(Tables.NUTRITION_PLANS)
        .select("*")
        .eq("user_id", clientId)
        .eq("is_current", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!plan) return res.json({ plan: null });

      return res.json({
        plan: {
          id: plan.id,
          version: plan.version,
          dailyTargets: plan.daily_targets,
          meals: plan.meals || [],
          days: plan.days || [],
          guidelines: plan.guidelines || [],
        },
      });
    } catch (err) {
      console.error("[coach-plans] nutrition get error:", err);
      return res.status(500).json({ message: "Kunne ikke hente ernæringsplan." });
    }
  }
);

/* ─── Weight Management ──────────────────────────── */

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

CoachPlansRoutes.get(
  "/:clientId/weights",
  ensureAuth as any,
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

      const { data: entries } = await db
        .from(Tables.WEIGHT_ENTRIES)
        .select("date, kg")
        .eq("user_id", clientId)
        .gte("date", startDate.toISOString().slice(0, 10))
        .order("date", { ascending: true });

      return res.json({ weights: entries || [] });
    } catch (err) {
      console.error("[coach-plans] weights get error:", err);
      return res.status(500).json({ message: "Kunne ikke hente vektdata." });
    }
  }
);

CoachPlansRoutes.post(
  "/:clientId/weights",
  ensureAuth as any,
  validateZod({ body: z.object({ date: IsoDate, kg: z.number().min(20).max(500) }) }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { date, kg } = req.body;
      const todayIso = new Date().toISOString().slice(0, 10);
      if (date > todayIso) return res.status(400).json({ message: "Dato kan ikke være i fremtiden." });

      await db
        .from(Tables.WEIGHT_ENTRIES)
        .upsert({ user_id: clientId, date, kg }, { onConflict: "user_id,date" });

      try {
        await insertOne(Tables.CHANGE_EVENTS, {
          user_id: clientId,
          type: "WEIGHT_LOG",
          summary: `Vekt ${kg} kg registrert (${date}) av coach`,
          actor: { id: coachId, role: "coach" },
          after_data: { date, kg },
        });
      } catch {}

      return res.json({ ok: true, date, kg });
    } catch (err) {
      console.error("[coach-plans] weight log error:", err);
      return res.status(500).json({ message: "Kunne ikke registrere vekt." });
    }
  }
);

CoachPlansRoutes.delete(
  "/:clientId/weights",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      const date = req.query.date as string;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      await db.from(Tables.WEIGHT_ENTRIES).delete().eq("user_id", clientId).eq("date", date);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[coach-plans] weight delete error:", err);
      return res.status(500).json({ message: "Kunne ikke slette vektregistrering." });
    }
  }
);

/* ─── Goal Management ────────────────────────────── */

const goalSchema = z.object({
  targetWeightKg: z.number().min(20).max(500).optional(),
  strengthTargets: z.string().max(500).optional(),
  horizonWeeks: z.number().int().min(1).max(260).optional(),
});

CoachPlansRoutes.put(
  "/:clientId/goal",
  ensureAuth as any,
  validateZod({ body: goalSchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const isCoach = await verifyCoachClient(coachId, clientId);
      if (!isCoach) return res.status(403).json({ message: "Ikke din klient." });

      const { targetWeightKg, strengthTargets, horizonWeeks } = req.body;

      const { data: latest } = await db
        .from(Tables.GOALS)
        .select("version")
        .eq("user_id", clientId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((latest as any)?.version || 0) + 1;

      await db.from(Tables.GOALS).update({ is_current: false }).eq("user_id", clientId).eq("is_current", true);

      const goal = await insertOne(Tables.GOALS, {
        user_id: clientId,
        version: nextVersion,
        is_current: true,
        target_weight_kg: targetWeightKg,
        strength_targets: strengthTargets,
        horizon_weeks: horizonWeeks,
      });

      if (!goal) return res.status(500).json({ message: "Kunne ikke lagre mål." });

      return res.json({
        goal: {
          targetWeightKg: goal.target_weight_kg,
          strengthTargets: goal.strength_targets,
          horizonWeeks: goal.horizon_weeks,
          version: nextVersion,
        },
      });
    } catch (err) {
      console.error("[coach-plans] goal save error:", err);
      return res.status(500).json({ message: "Kunne ikke lagre mål." });
    }
  }
);

export default CoachPlansRoutes;
