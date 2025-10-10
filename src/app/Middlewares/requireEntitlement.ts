import { Request, Response, NextFunction } from 'express';
import { User } from '../Models/User';

export async function requireEntitlement(req: Request, res: Response, next: NextFunction) {
  try {
    // @ts-ignore
    const user = req.user;
    if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
    // Simple guard: require status SUBSCRIBED or active subscription in request context
    if ((user as any)?.status === 'SUBSCRIBED') return next();
    // Re-fetch fresh user from DB to account for status flips during session
    try {
      // @ts-ignore
      const userId = (user as any)._id || (user as any).id;
      if (userId) {
        const fresh: any = await User.findById(userId).select('status').lean();
        if (fresh?.status === 'SUBSCRIBED') return next();
      }
    } catch {}
    // Optionally check a hydrated flag on req (set upstream) or roles
    return res.status(403).json({ error: { message: 'Subscription required' } });
  } catch {
    return res.status(500).json({ error: { message: 'Guard failed' } });
  }
}


