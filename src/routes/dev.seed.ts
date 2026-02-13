import { Router } from 'express';
import { findOne, insertOne, insertMany, db, Tables } from "../lib/db";
import { validateZod } from "../app/Middlewares";
import { z } from "zod";
import { objectId } from "../app/Validation/requestSchemas";

const r = Router();
const seedSchema = z.object({ userId: objectId.optional() }).strict();

r.post('/dev/seed/coach-majen', validateZod({ body: z.object({}).strict() }), async (req, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== 'true') return res.status(404).end();
    const existing = await findOne(Tables.USERS, { user_name: 'coach-majen' });
    if (existing) return res.json({ ok: true, userId: existing.id });
    const u = await insertOne(Tables.USERS, {
      full_name: 'Coach Majen',
      first_name: 'Coach',
      last_name: 'Majen',
      user_name: 'coach-majen',
      role: 'creator',
      is_active: true,
      is_verified: true,
      has_personal_info: true,
      has_photo_info: false,
      has_selected_interest: false,
      has_confirmed_age: true,
      status: 'TRIAL',
    });
    if (!u) return res.status(500).json({ ok: false, error: 'insert failed' });
    return res.json({ ok: true, userId: u.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as any)?.message || 'seed failed' });
  }
});

// DEV: Seed 14 days of sample ChangeEvents (plan/nutrition/weight)
r.post('/dev/seed/sample-14d', validateZod({ body: seedSchema }), async (req, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== 'true') return res.status(404).end();
    // Pick target user
    let userId = (req.body && (req.body.userId as string)) || '';
    if (!userId) {
      const { data: anyUser } = await db.from(Tables.USERS).select('id').neq('is_deleted', true).limit(1).maybeSingle();
      if (!anyUser) return res.status(400).json({ ok: false, error: 'no user to seed' });
      userId = anyUser.id;
    }
    const now = new Date();
    const events: { type: string; summary: string; createdAt: Date; updatedAt: Date; after?: any }[] = [];
    for (let d = 0; d < 14; d++) {
      const at = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      events.push({ type: 'WEIGHT_LOG', summary: `Weight ${(80 + (d % 3) - 1).toFixed(1)}kg`, createdAt: at, updatedAt: at, after: { date: at.toISOString().slice(0, 10), kg: 80 + (d % 3) - 1 } });
      if (d % 5 === 0) {
        events.push({ type: 'PLAN_EDIT', summary: `Adjusted training v${d / 5 + 1}`, createdAt: at, updatedAt: at });
      }
      if (d % 7 === 0) {
        events.push({ type: 'NUTRITION_EDIT', summary: `Adjusted kcal ${2200 + d * 5}`, createdAt: at, updatedAt: at, after: { kcal: 2200 + d * 5 } });
      }
    }
    if (events.length) {
      await insertMany(Tables.CHANGE_EVENTS, events.map(e => ({
        user_id: userId,
        type: e.type,
        summary: e.summary,
        actor: userId,
        created_at: e.createdAt.toISOString(),
        updated_at: e.updatedAt.toISOString(),
        after_data: e.after ?? null,
      })));
    }
    return res.json({ ok: true, userId, inserted: events.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as any)?.message || 'seed failed' });
  }
});

export default r;
