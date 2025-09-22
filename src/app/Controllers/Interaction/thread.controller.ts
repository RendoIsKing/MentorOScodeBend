import { Request, Response } from 'express';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import { ChatThread, ChatMessage } from '../../Models/ChatModels';

function resolveUserId(req: any): string | undefined {
  if (req?.user?._id) return String(req.user._id);
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

export const getThread = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const partner = (req as any).params?.partner || 'coach-engh';
    const thread = await ChatThread.findOneAndUpdate(
      { userId, partner },
      { $setOnInsert: { userId: new Types.ObjectId(userId), partner } },
      { upsert: true, new: true }
    );
    const msgs = await ChatMessage.find({ threadId: thread._id }).sort({ createdAt: 1 }).lean();
    res.json({ threadId: thread._id, messages: msgs });
  } catch (e) {
    res.status(500).json({ message: 'thread fetch failed' });
  }
};

export const appendMessage = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const partner = (req as any).params?.partner || 'coach-engh';
    const { sender, text } = req.body || {};
    if (!sender || !text) return res.status(400).json({ message: 'sender and text required' });
    const thread = await ChatThread.findOneAndUpdate(
      { userId, partner },
      { $setOnInsert: { userId: new Types.ObjectId(userId), partner } },
      { upsert: true, new: true }
    );
    const msg = await ChatMessage.create({ threadId: thread._id, sender, text });
    res.json({ data: msg });
  } catch (e) {
    res.status(500).json({ message: 'append failed' });
  }
};

export const clearThread = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(400).json({ message: 'userId required' });
    const partner = (req as any).params?.partner || 'coach-engh';
    const thread = await ChatThread.findOne({ userId, partner });
    if (thread) {
      await ChatMessage.deleteMany({ threadId: thread._id });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'clear failed' });
  }
};


