import { Router } from 'express';
import { User } from '../app/Models/User';

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


