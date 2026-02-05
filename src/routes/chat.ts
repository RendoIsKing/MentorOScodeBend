import { Router } from 'express';
import type { Request, Response } from 'express';
import { ChatThread, ChatMessage } from '../models/chat';
import { OpenAI } from 'openai';
import { analyzeSafety } from '../services/safety/trafficLight';
import { generateEmbedding } from '../services/ai/embeddingService';
import { CoachKnowledge } from '../app/Models/CoachKnowledge';
import { Types } from 'mongoose';
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

const previewChatSchema = z.object({
  message: nonEmptyString,
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).optional(),
  previewMode: z.boolean().optional(),
}).strict();

function me(req: Request) {
  // @ts-ignore
  return req.user?._id?.toString?.();
}

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();
function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
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

r.post(
  '/preview',
  ensureAuth as any,
  perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30) }),
  validateZod({ body: previewChatSchema }),
  async (req, res) => {
  try {
    const myId = me(req);
    if (!myId) return res.status(401).json({ error: 'unauthorized' });

    const { message, history = [] } = req.body as any;
    const safety = await analyzeSafety(String(message));
    if (safety.status === "red") {
      return res.json({ reply: null, safety });
    }

    const { User } = await import('../app/Models/User');
    const meUser = await (User as any).findById(myId).lean();
    const systemPrompt = String(meUser?.mentorAiTrainingPhilosophy || '').trim();
    let contextData = "";
    const MAX_CONTEXT_CHARS = 3500;
    try {
      const queryVector = await generateEmbedding(String(message));
      const mentorObjectId = new Types.ObjectId(myId);
      const pipeline: any[] = [
        {
          $vectorSearch: {
            index: "default",
            path: "embedding",
            queryVector,
            numCandidates: 80,
            limit: 3,
            filter: { userId: { $eq: mentorObjectId } },
          },
        },
        { $project: { content: 1, title: 1, score: { $meta: "vectorSearchScore" } } },
      ];
      const results = await CoachKnowledge.aggregate(pipeline);
      const chunks = results
        .map((item: { content?: string; title?: string }) => {
          const title = String(item?.title || "").trim();
          const body = String(item?.content || "").trim();
          if (!body) return "";
          return title ? `Title: ${title}\n${body}` : body;
        })
        .filter(Boolean);
      const combined = chunks.join("\n\n");
      contextData = combined.length > MAX_CONTEXT_CHARS ? combined.slice(0, MAX_CONTEXT_CHARS) : combined;
    } catch {}

    const baseSystem = systemPrompt
      ? `You are a mentor's AI avatar. Use the mentor's coaching style below.\nCoaching style:\n${systemPrompt}`
      : "You are a mentor's AI avatar. Be supportive, concrete, and helpful.";
    const withContext = contextData
      ? `${baseSystem}\n\nKnowledge base context:\n${contextData}`
      : baseSystem;

    const historyItems =
      (Array.isArray(history) ? history : []) as Array<{ role: "user" | "assistant"; content: string }>;
    const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: withContext },
      ...historyItems.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      })),
      { role: "user", content: String(message) },
    ];

    const client = getOpenAI();
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: msgs as any,
      temperature: 0.7,
    });
    const reply = response.choices?.[0]?.message?.content || "";
    return res.json({ reply, safety });
  } catch {
    return res.status(500).json({ error: 'preview_failed' });
  }
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


