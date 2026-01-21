import { Router } from "express";
import { User } from "../app/Models/User";
import TrainingPlanVersion from "../models/TrainingPlanVersion";
import NutritionPlanVersion from "../models/NutritionPlanVersion";
import StudentState from "../models/StudentState";
import StudentSnapshot from "../models/StudentSnapshot";
import { validateZod } from "../app/Middlewares";
import { z } from "zod";

const r = Router();
const bootstrapSchema = z.object({ email: z.string().email().optional() }).strict();

r.post("/dev/bootstrap", validateZod({ body: bootstrapSchema }), async (req: any, res) => {
  try {
    const enabled = String(process.env.DEV_LOGIN_ENABLED || '').trim().toLowerCase();
    const devOn = enabled === 'true' || (process.env.NODE_ENV !== 'production');
    if (!devOn) return res.status(404).json({ error: 'DEV_LOGIN_DISABLED', value: process.env.DEV_LOGIN_ENABLED });
    const email = String((req.body?.email || "demo@mentoros.app").toLowerCase());

    let user = await (User as any).findOne({ email });
    if (!user) user = await (User as any).create({ email, fullName: "Demo User" });

    // Ensure initial plan versions and state
    let state = await StudentState.findOne({ user: user._id });
    if (!state) {
      const tp = await TrainingPlanVersion.create({
        user: user._id,
        version: 1,
        source: "manual",
        reason: "Bootstrap",
        days: [
          { day: 'Mon', focus: 'Full body', exercises: [{ name: 'Squat', sets: 3, reps: '8' }] },
          { day: 'Wed', focus: 'Pull', exercises: [{ name: 'Row', sets: 3, reps: '10' }] },
          { day: 'Fri', focus: 'Push', exercises: [{ name: 'Bench', sets: 3, reps: '8' }] },
        ],
      });
      const np = await NutritionPlanVersion.create({
        user: user._id,
        version: 1,
        source: "manual",
        reason: "Bootstrap",
        kcal: 2400,
        proteinGrams: 140,
        carbsGrams: 300,
        fatGrams: 70,
      });
      state = await StudentState.create({ user: user._id, currentTrainingPlanVersion: tp._id, currentNutritionPlanVersion: np._id });
      await StudentSnapshot.findOneAndUpdate(
        { user: user._id },
        { $setOnInsert: { weightSeries: [], trainingPlanSummary: { daysPerWeek: 3 }, nutritionSummary: { kcal: 2400, protein: 140, carbs: 300, fat: 70 }, kpis: { adherence7d: 0 } } },
        { upsert: true }
      );
    }

    return res.json({ ok: true, userId: user._id.toString() });
  } catch (e) {
    return res.status(500).json({ error: "bootstrap failed" });
  }
});

export default r;


