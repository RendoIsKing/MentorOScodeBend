import { Request, Response } from 'express';
import { User } from '../../Models/User';

export async function acceptTos(req: Request, res: Response) {
  try {
    // @ts-ignore
    const user = req.user;
    if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const version = (req.body?.version as string) || '1.0';
    await User.updateOne({ _id: user._id }, { $set: { acceptedTosAt: new Date(), tosVersion: version } });
    return res.json({ ok: true, version });
  } catch {
    return res.status(500).json({ error: { message: 'acceptance failed' } });
  }
}


