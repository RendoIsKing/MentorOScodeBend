import { Router } from "express";
import { findOne, insertOne, upsert, Tables } from "../lib/db";
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

    let user = await findOne(Tables.USERS, { email });
    if (!user) user = await insertOne(Tables.USERS, { email, full_name: "Demo User" });
    if (!user) return res.status(500).json({ error: "bootstrap failed" });

    // Ensure initial plan versions and state
    let state = await findOne(Tables.STUDENT_STATES, { user_id: user.id });
    if (!state) {
      const tp = await insertOne(Tables.TRAINING_PLAN_VERSIONS, {
        user_id: user.id,
        version: 1,
        source: "manual",
        reason: "Bootstrap",
        days: [
          { day: 'Mon', focus: 'Full body', exercises: [{ name: 'Squat', sets: 3, reps: '8' }] },
          { day: 'Wed', focus: 'Pull', exercises: [{ name: 'Row', sets: 3, reps: '10' }] },
          { day: 'Fri', focus: 'Push', exercises: [{ name: 'Bench', sets: 3, reps: '8' }] },
        ],
      });
      const np = await insertOne(Tables.NUTRITION_PLAN_VERSIONS, {
        user_id: user.id,
        version: 1,
        source: "manual",
        reason: "Bootstrap",
        kcal: 2400,
        protein_grams: 140,
        carbs_grams: 300,
        fat_grams: 70,
      });
      if (!tp || !np) return res.status(500).json({ error: "bootstrap failed" });
      state = await insertOne(Tables.STUDENT_STATES, {
        user_id: user.id,
        current_training_plan_version: tp.id,
        current_nutrition_plan_version: np.id,
      });
      await upsert(Tables.STUDENT_SNAPSHOTS, {
        user_id: user.id,
        weight_series: [],
        training_plan_summary: { daysPerWeek: 3 },
        nutrition_summary: { kcal: 2400, protein: 140, carbs: 300, fat: 70 },
        kpis: { adherence7d: 0 },
      }, 'user_id');
    }

    return res.json({ ok: true, userId: user.id });
  } catch (e) {
    return res.status(500).json({ error: "bootstrap failed" });
  }
});

export default r;
