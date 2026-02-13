import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db, findOne, findMany, insertOne, deleteById, Tables } from '../../../lib/db';

function resolveUserId(req: any): string | undefined {
  if (req?.user?._id) return String(req.user._id);
  if (req?.user?.id) return String(req.user.id);
  if (req?.body?.userId) return String(req.body.userId);
  if (req?.query?.userId) return String(req.query.userId);
  const cookie = req.headers?.cookie as string | undefined;
  const match = cookie?.match(/auth_token=([^;]+)/);
  if (!match) return undefined;
  try {
    const token = decodeURIComponent(match[1]);
    const secret = process.env.JWT_SECRET || 'secret_secret';
    const decoded: any = jwt.verify(token, secret);
    return decoded?.id || decoded?._id;
  } catch { return undefined; }
}

/**
 * Get (or create) a legacy interaction thread by userId + partner.
 * These threads use the participants array to store [userId] and
 * rely on a separate "partner" column for the coach identifier.
 *
 * NOTE: If your chat_threads table does not have user_id / partner
 * columns, you can replicate this with participants = [userId] and
 * store the partner name inside the unread JSONB as { _partner: name }.
 */
export const getThread = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const partner = (req as any).params?.partner || 'coach-engh';

    // Find existing thread
    let thread = await findOne(Tables.CHAT_THREADS, { user_id: userId, partner });

    // Create if not found (upsert equivalent)
    if (!thread) {
      thread = await insertOne(Tables.CHAT_THREADS, {
        user_id: userId,
        partner,
        participants: [userId],
        last_message_at: new Date().toISOString(),
        unread: {},
      });
    }
    if (!thread) return res.status(500).json({ message: 'thread creation failed' });

    const msgs = await findMany(Tables.CHAT_MESSAGES, { thread_id: thread.id }, {
      orderBy: 'created_at',
      ascending: true,
    });

    return res.json({ threadId: thread.id, messages: msgs });
  } catch (e) {
    return res.status(500).json({ message: 'thread fetch failed' });
  }
};

export const appendMessage = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const partner = (req as any).params?.partner || 'coach-engh';
    const { sender, text } = req.body || {};
    if (!sender || !text) return res.status(400).json({ message: 'sender and text required' });

    // Find or create thread
    let thread = await findOne(Tables.CHAT_THREADS, { user_id: userId, partner });
    if (!thread) {
      thread = await insertOne(Tables.CHAT_THREADS, {
        user_id: userId,
        partner,
        participants: [userId],
        last_message_at: new Date().toISOString(),
        unread: {},
      });
    }
    if (!thread) return res.status(500).json({ message: 'thread creation failed' });

    const msg = await insertOne(Tables.CHAT_MESSAGES, {
      thread_id: thread.id,
      sender,
      text,
    });

    return res.json({ data: msg });
  } catch (e) {
    return res.status(500).json({ message: 'append failed' });
  }
};

export const clearThread = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const partner = (req as any).params?.partner || 'coach-engh';

    const thread = await findOne(Tables.CHAT_THREADS, { user_id: userId, partner });
    if (thread) {
      // Delete all messages belonging to this thread
      const { error } = await db
        .from(Tables.CHAT_MESSAGES)
        .delete()
        .eq('thread_id', thread.id);
      if (error) console.error('[clearThread] delete messages failed:', error.message);
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'clear failed' });
  }
};


