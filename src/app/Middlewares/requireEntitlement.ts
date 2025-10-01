import { Request, Response, NextFunction } from 'express';

export async function requireEntitlement(req: Request, res: Response, next: NextFunction) {
  try {
    // @ts-ignore
    const user = req.user;
    if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
    // Simple guard: require status SUBSCRIBED or active subscription in request context
    if ((user as any).status === 'SUBSCRIBED') return next();
    // Optionally check a hydrated flag on req (set upstream) or roles
    return res.status(403).json({ error: { message: 'Subscription required' } });
  } catch {
    return res.status(500).json({ error: { message: 'Guard failed' } });
  }
}


