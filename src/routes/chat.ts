import { Router } from 'express';
import type { Request, Response } from 'express';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { db, findById, insertOne, updateById, Tables } from '../lib/db';
import { analyzeSafety } from '../services/safety/trafficLight';
import { retrieveContext } from '../services/ai/ragService';
import { sseAddClient, sseRemoveClient, ssePush } from '../lib/sseHub';
import { Auth as ensureAuth, validateZod } from '../app/Middlewares';
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';
import { chatMessageSchema } from '../app/Validation/schemas';
import { nonEmptyString } from '../app/Validation/requestSchemas';
import * as Sentry from '@sentry/node';

const r = Router();

// ── Validation helpers (UUID-based, replaces objectId/objectIdParam) ────────
const uuidString = z.string().uuid();
const uuidParam = (key: string = 'id') =>
  z.object({ [key]: uuidString } as Record<string, z.ZodTypeAny>).strict();

const createThreadSchema = z.object({
  userId: uuidString,
}).strict();

const previewChatSchema = z.object({
  message: nonEmptyString,
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) })).optional(),
  previewMode: z.boolean().optional(),
}).strict();

function me(req: Request) {
  return (req as any).user?._id?.toString?.() || (req as any).user?.id;
}

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();
function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

// ── POST /threads — create or find a DM thread ─────────────────────────────
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

    // Find existing thread that contains both participants
    const { data: existing } = await db
      .from(Tables.CHAT_THREADS)
      .select('id')
      .contains('participants', pair)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return res.json({ threadId: existing.id });
    }

    // Create new thread
    const unread: Record<string, number> = { [userId]: 0, [myId]: 0 };
    const thread = await insertOne(Tables.CHAT_THREADS, {
      participants: pair,
      last_message_at: new Date().toISOString(),
      unread,
    });
    if (!thread) return res.status(500).json({ error: 'create_failed' });
    return res.json({ threadId: thread.id });
  },
);

// ── GET /threads — list my threads ──────────────────────────────────────────
r.get('/threads', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: 120 }), async (req, res) => {
  const myId = me(req);
  if (!myId) return res.status(401).json({ error: 'unauthorized' });

  const { data: threads } = await db
    .from(Tables.CHAT_THREADS)
    .select('*')
    .contains('participants', [myId])
    .order('last_message_at', { ascending: false });

  return res.json({
    threads: (threads || []).map((t: any) => ({
      id: t.id,
      lastMessageAt: t.last_message_at,
      lastMessageText: t.last_message_text || '',
      unread: t.unread?.[myId] ?? 0,
      participants: t.participants || [],
    })),
  });
});

// ── GET /threads/:id/messages — paginated message history ───────────────────
r.get(
  '/threads/:id/messages',
  ensureAuth as any,
  perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30) }),
  async (req, res) => {
    const myId = me(req);
    if (!myId) return res.status(401).json({ error: 'unauthorized' });
    const { id } = req.params;

    const thread = await findById(Tables.CHAT_THREADS, id);
    if (!thread) return res.status(404).json({ error: 'not found' });
    if (!(thread.participants || []).includes(myId)) return res.status(403).json({ error: 'forbidden' });

    const { cursor, limit = 30 } = req.query as any;
    let query = db.from(Tables.CHAT_MESSAGES).select('*').eq('thread_id', id);

    if (cursor) {
      // cursor is a message ID — resolve its created_at for keyset pagination
      const cursorMsg = await findById(Tables.CHAT_MESSAGES, cursor, 'created_at');
      if (cursorMsg) {
        query = query.lt('created_at', cursorMsg.created_at);
      }
    }

    const { data: messages } = await query
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    const msgs = (messages || []).reverse();
    return res.json({
      messages: msgs.map((m: any) => ({
        id: m.id,
        text: m.text,
        sender: m.sender,
        createdAt: m.created_at,
      })),
      nextCursor: msgs.length ? msgs[0].id : null,
    });
  },
);

// ── POST /threads/:id/messages — send a message ────────────────────────────
r.post(
  '/threads/:id/messages',
  ensureAuth as any,
  perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30) }),
  validateZod({ params: uuidParam('id'), body: z.object({ text: nonEmptyString }).strict() }),
  async (req, res) => {
    const myId = me(req);
    if (!myId) return res.status(401).json({ error: 'unauthorized' });
    const { id } = req.params;
    const parsed = chatMessageSchema.safeParse({ text: (req.body || {}).text });
    if (!parsed.success) return res.status(422).json({ error: 'validation_failed', details: parsed.error.flatten() });
    const text = parsed.data.text;

    const thread = await findById(Tables.CHAT_THREADS, id);
    if (!thread) return res.status(404).json({ error: 'not found' });
    if (!(thread.participants || []).includes(myId)) return res.status(403).json({ error: 'forbidden' });

    const msg = await insertOne(Tables.CHAT_MESSAGES, {
      thread_id: thread.id,
      sender: myId,
      text: text.trim(),
      read_by: [myId],
    });
    if (!msg) return res.status(500).json({ error: 'send_failed' });

    // Update thread metadata & per-user unread counts
    const now = new Date().toISOString();
    const unread: Record<string, number> = { ...(thread.unread || {}) };
    for (const p of (thread.participants || [])) {
      unread[p] = p === myId ? 0 : (unread[p] ?? 0) + 1;
    }
    await updateById(Tables.CHAT_THREADS, id, {
      last_message_at: now,
      last_message_text: msg.text,
      unread,
    });

    // SSE push to all participants
    for (const p of (thread.participants || [])) {
      ssePush(p, 'chat:message', {
        threadId: thread.id,
        message: { id: msg.id, text: msg.text, sender: myId, createdAt: msg.created_at },
      });
      ssePush(p, 'chat:thread', {
        id: thread.id,
        lastMessageAt: now,
        lastMessageText: msg.text,
        unread: unread[p] ?? 0,
      });
    }

    try { Sentry.addBreadcrumb({ category: 'chat', message: 'thread-message-sent', level: 'info', data: { threadId: thread.id, sender: myId } }); } catch {}
    return res.json({ ok: true, id: msg.id });
  },
);

// ── POST /threads/:id/read — mark messages as read ──────────────────────────
r.post(
  '/threads/:id/read',
  ensureAuth as any,
  perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT_PER_MIN || 30) }),
  validateZod({ params: uuidParam('id'), body: z.object({}).strict() }),
  async (req, res) => {
    const myId = me(req);
    if (!myId) return res.status(401).json({ error: 'unauthorized' });
    const { id } = req.params;

    const thread = await findById(Tables.CHAT_THREADS, id);
    if (!thread) return res.status(404).json({ error: 'not found' });
    if (!(thread.participants || []).includes(myId)) return res.status(403).json({ error: 'forbidden' });

    // Add myId to read_by for messages sent by others
    // (no atomic array_append via JS client, so fetch-and-update)
    const { data: unreadMsgs } = await db
      .from(Tables.CHAT_MESSAGES)
      .select('id, read_by')
      .eq('thread_id', id)
      .neq('sender', myId);

    if (unreadMsgs) {
      for (const m of unreadMsgs) {
        const readBy: string[] = m.read_by || [];
        if (!readBy.includes(myId)) {
          await db.from(Tables.CHAT_MESSAGES).update({ read_by: [...readBy, myId] }).eq('id', m.id);
        }
      }
    }

    // Clear unread count for this user
    const unread = { ...(thread.unread || {}), [myId]: 0 };
    await updateById(Tables.CHAT_THREADS, id, { unread });

    ssePush(myId, 'chat:thread', {
      id: thread.id,
      lastMessageAt: thread.last_message_at,
      lastMessageText: thread.last_message_text,
      unread: 0,
    });
    return res.json({ ok: true });
  },
);

// ── POST /preview — AI mentor preview ───────────────────────────────────────
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

      // Use the mentor AI training philosophy from the authenticated user
      // (already loaded by auth middleware)
      const systemPrompt = String((req as any).user?.mentorAiTrainingPhilosophy || '').trim();
      let contextData = "";
      let retrievedDocuments: Array<{ title: string; snippet: string }> = [];
      const MAX_CONTEXT_CHARS = 3500;
      try {
        const docs = await retrieveContext(String(message), myId);
        retrievedDocuments = docs.map((d) => ({ title: d.title, snippet: d.snippet }));
        const chunks = docs.map((d) => `Title: ${d.title}\n${d.content}`);
        const combined = chunks.join("\n\n");
        contextData = combined.length > MAX_CONTEXT_CHARS ? combined.slice(0, MAX_CONTEXT_CHARS) : combined;
      } catch {}

      const baseSystem = systemPrompt
        ? `You are a Mentor AI. Your persona/style is: "${systemPrompt}".`
        : "You are a Mentor AI. Be supportive, concrete, and helpful.";
      const withContext = contextData
        ? `${baseSystem}\n\nINSTRUCTIONS:\n- You are provided with a CONTEXT block from the mentor's knowledge base.\n- Priority 1: If the answer is found in the CONTEXT, use that information explicitly.\n- Priority 2: If the answer is NOT in the CONTEXT, or if the user asks for general advice/more examples, use your general expertise as a coach.\n- NEVER state "I don't have this in my context". Just answer the question naturally using the persona.\n\nCONTEXT:\n${contextData}`
        : baseSystem;

      const rawHistory = Array.isArray(history) ? history : [];
      const historyItems = rawHistory.filter(
        (m: any) => m && (m.role === "user" || m.role === "assistant")
      ) as Array<{ role: "user" | "assistant"; content: string }>;

      const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: withContext },
      ];
      for (const m of historyItems) {
        msgs.push({ role: m.role, content: String(m.content || "") });
      }
      msgs.push({ role: "user", content: String(message) });

      const client = getOpenAI();
      try {
        console.log(`Sending to OpenAI. Context Included? ${Boolean(contextData)}`);
      } catch {}
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: msgs as any,
        temperature: 0.7,
      });
      const reply = response.choices?.[0]?.message?.content || "";
      return res.json({ reply, safety, retrievedDocuments });
    } catch {
      return res.status(500).json({ error: 'preview_failed' });
    }
  },
);

// ── GET /sse — Server-Sent Events stream (kept for Phase 5 replacement) ─────
r.get('/sse', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_SSE_PER_MIN || 30) }), (req: any, res: Response) => {
  const myId = me(req);
  if (!myId) return res.status(401).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  // @ts-ignore
  res.flushHeaders?.();
  res.write(':\n\n');
  sseAddClient(myId, res);
  req.on('close', () => { sseRemoveClient(myId, res); try { res.end(); } catch {} });
  return;
});

export default r;


