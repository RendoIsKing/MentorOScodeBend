import { Request, Response } from 'express';
import { User } from '../../Models/User';

export async function acceptTos(req: Request, res: Response) {
  try {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const version = (req.body?.version as string) || '1.0';
    const id = user?._id || user?.id;
    if (!id) return res.status(400).json({ error: { message: 'invalid user id' } });
    await User.updateOne({ _id: id }, { $set: { acceptedTosAt: new Date(), tosVersion: version } });
    return res.json({ ok: true, version });
  } catch {
    return res.status(500).json({ error: { message: 'acceptance failed' } });
  }
}


