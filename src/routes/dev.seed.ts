import { Router } from 'express';
import { User } from '../app/Models/User';
import ChangeEvent from '../models/ChangeEvent';
import { Types } from 'mongoose';

const r = Router();

r.post('/dev/seed/coach-majen', async (req, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== 'true') return res.status(404).end();
    const existing = await User.findOne({ userName: 'coach-majen' }).lean();
    if (existing) return res.json({ ok: true, userId: existing._id });
    const u = await User.create({
      fullName: 'Coach Majen',
      firstName: 'Coach',
      lastName: 'Majen',
      userName: 'coach-majen',
      role: 'creator',
      isActive: true,
      isVerified: true,
      hasPersonalInfo: true,
      hasPhotoInfo: false,
      hasSelectedInterest: false,
      hasConfirmedAge: true,
      status: 'TRIAL',
    } as any);
    return res.json({ ok: true, userId: u._id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as any)?.message || 'seed failed' });
  }
});

export default r;



// DEV: Seed 14 days of sample ChangeEvents (plan/nutrition/weight)
r.post('/dev/seed/sample-14d', async (req, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== 'true') return res.status(404).end();
    // Pick target user
    let userId = (req.body && (req.body.userId as string)) || '';
    if (!userId) {
      const any = await User.findOne({ isDeleted: { $ne: true } }).lean();
      if (!any) return res.status(400).json({ ok: false, error: 'no user to seed' });
      userId = String((any as any)._id);
    }
    const uid = new Types.ObjectId(userId);
    const now = new Date();
    const events: any[] = [];
    for (let d = 0; d < 14; d++) {
      const at = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      events.push({ user: uid, type: 'WEIGHT_LOG', summary: `Weight ${(80 + (d%3)-1).toFixed(1)}kg`, actor: uid, createdAt: at, updatedAt: at, after: { date: at.toISOString().slice(0,10), kg: 80 + (d%3)-1 } });
      if (d % 5 === 0) {
        events.push({ user: uid, type: 'PLAN_EDIT', summary: `Adjusted training v${d/5+1}`, actor: uid, createdAt: at, updatedAt: at });
      }
      if (d % 7 === 0) {
        events.push({ user: uid, type: 'NUTRITION_EDIT', summary: `Adjusted kcal ${2200 + d*5}`, actor: uid, createdAt: at, updatedAt: at, after: { kcal: 2200 + d*5 } });
      }
    }
    if (events.length) await (ChangeEvent as any).insertMany(events, { ordered: false });
    return res.json({ ok: true, userId, inserted: events.length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as any)?.message || 'seed failed' });
  }
});
