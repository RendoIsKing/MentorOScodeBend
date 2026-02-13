import { Request, Response } from 'express';
import { updateById, Tables } from '../../../lib/db';

export async function acceptTos(req: Request, res: Response) {
  try {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const version = (req.body?.version as string) || '1.0';
    const id = user?.id || user?._id;
    if (!id) return res.status(400).json({ error: { message: 'invalid user id' } });
    await updateById(Tables.USERS, id, {
      accepted_tos_at: new Date().toISOString(),
      tos_version: version,
    });
    return res.json({ ok: true, version });
  } catch {
    return res.status(500).json({ error: { message: 'acceptance failed' } });
  }
}
