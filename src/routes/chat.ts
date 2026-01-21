import { Router } from 'express';
import type { Request, Response } from 'express';
import { ChatThread, ChatMessage } from '../models/chat';
import { sseAddClient, sseRemoveClient, ssePush } from '../lib/sseHub';
import { Auth as ensureAuth, validateZod } from '../app/Middlewares';
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';
import { chatMessageSchema } from '../app/Validation/schemas';
import { z } from 'zod';
import { nonEmptyString, objectId, objectIdParam } from '../app/Validation/requestSchemas';

const r = Router();

const createThreadSchema = z.object({
  userId: objectId,
}).strict();

function me(req: Request) {
  // @ts-ignore
  return req.user?._id?.toString?.();
}

r.post(
  '/threads',
  ensureAuth as any,
  perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30) }),
  validateZod({ body: createThreadSchema }),
  async (req, res) => {
  const myId = me(req);
  if (!myId) return res.status(401).json({ error: 'unauthorized' });
  const { userId } = req.body || {};
  if (!userId || userId === myId) return res.status(400).json({ error: 'bad userId' });
  const pair = [myId, userId].sort();
  let thread = await ChatThread.findOne({ participants: { $all: pair, $size: 2 } });
  if (!thread) {
    thread = await ChatThread.create({ participants: pair, lastMessageAt: new Date(), unread: new Map([[userId, 0],[myId,0]]) });
  }
  return res.json({ threadId: thread._id.toString() });
});

r.get('/threads', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req, res) => {
  const myId = me(req);
  if (!myId) return res.status(401).json({ error: 'unauthorized' });
  const threads = await ChatThread.find({ participants: myId }).sort({ lastMessageAt: -1 }).lean();
  return res.json({ threads: threads.map(t=>({ id: t._id.toString(), lastMessageAt: t.lastMessageAt, lastMessageText: t.lastMessageText || '', unread: (t.unread?.get(myId) ?? 0), participants: t.participants.map(String) })) });
});

r.get('/threads/:id/messages', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30) }), async (req, res) => {
  const myId = me(req);
  if (!myId) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.params;
  const thread = await ChatThread.findById(id).lean();
  if (!thread) return res.status(404).json({ error: 'not found' });
  if (!thread.participants.map(String).includes(myId)) return res.status(403).json({ error: 'forbidden' });
  const { cursor, limit = 30 } = req.query as any;
  const q: any = { thread: id };
  if (cursor) q._id = { $lt: cursor };
  const messages = await ChatMessage.find(q).sort({ _id: -1 }).limit(Number(limit)).lean();
  return res.json({ messages: messages.reverse().map(m=>({ id: m._id.toString(), text: m.text, sender: m.sender.toString(), createdAt: m.createdAt })), nextCursor: messages.length ? messages[0]._id.toString() : null });
});

r.post(
  '/threads/:id/messages',
  ensureAuth as any,
  perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30) }),
  validateZod({ params: objectIdParam('id'), body: z.object({ text: nonEmptyString }).strict() }),
  async (req, res) => {
  const myId = me(req);
  if (!myId) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.params;
  const parsed = chatMessageSchema.safeParse({ text: (req.body||{}).text });
  if (!parsed.success) return res.status(422).json({ error: 'validation_failed', details: parsed.error.flatten() });
  const text = parsed.data.text;
  const thread = await ChatThread.findById(id);
  if (!thread) return res.status(404).json({ error: 'not found' });
  if (!thread.participants.map(String).includes(myId)) return res.status(403).json({ error: 'forbidden' });
  const msg = await ChatMessage.create({ thread: thread._id, sender: myId, text: text.trim(), readBy: [myId] });
  thread.lastMessageAt = new Date();
  thread.lastMessageText = msg.text;
  for (const p of thread.participants.map(String)) {
    thread.unread.set(p, p === myId ? 0 : (thread.unread.get(p) ?? 0) + 1);
  }
  await thread.save();
  for (const p of thread.participants.map(String)) {
    ssePush(p, 'chat:message', { threadId: thread._id.toString(), message: { id: msg._id.toString(), text: msg.text, sender: myId, createdAt: msg.createdAt } });
    ssePush(p, 'chat:thread', { id: thread._id.toString(), lastMessageAt: thread.lastMessageAt, lastMessageText: thread.lastMessageText, unread: thread.unread.get(p) ?? 0 });
  }
  return res.json({ ok: true, id: msg._id.toString() });
});

r.post(
  '/threads/:id/read',
  ensureAuth as any,
  perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30) }),
  validateZod({ params: objectIdParam('id'), body: z.object({}).strict() }),
  async (req, res) => {
  const myId = me(req);
  if (!myId) return res.status(401).json({ error: 'unauthorized' });
  const { id } = req.params;
  const thread = await ChatThread.findById(id);
  if (!thread) return res.status(404).json({ error: 'not found' });
  if (!thread.participants.map(String).includes(myId)) return res.status(403).json({ error: 'forbidden' });
  await ChatMessage.updateMany({ thread: id, sender: { $ne: myId } }, { $addToSet: { readBy: myId } });
  thread.unread.set(myId, 0);
  await thread.save();
  ssePush(myId, 'chat:thread', { id: thread._id.toString(), lastMessageAt: thread.lastMessageAt, lastMessageText: thread.lastMessageText, unread: 0 });
  return res.json({ ok: true });
});

r.get('/sse', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_SSE_PER_MIN || 30) }), (req: any, res: Response) => {
  const myId = me(req);
  if (!myId) return res.status(401).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  // @ts-ignore
  res.flushHeaders?.();
  res.write(':\n\n');
  sseAddClient(myId, res);
  req.on('close', () => { sseRemoveClient(myId, res); try{ res.end(); }catch{} });
  return;
});

export default r;


