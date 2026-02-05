import { Router } from 'express';
import { Auth as ensureAuth, validateZod } from '../app/Middlewares';
import { Types } from 'mongoose';
import { sseHub } from '../lib/sseHub';
import { ChatThread as DMThread } from '../models/chat';
import { ChatMessage as DMMessage } from '../models/chat';
import { User } from '../app/Models/User';
import { z } from 'zod';
import { nonEmptyString, objectId, objectIdParam } from '../app/Validation/requestSchemas';
import { generateResponse as generateMentorResponse } from '../services/ai/mentorAIService';
import { analyzeSafety } from '../services/safety/trafficLight';

const r = Router();

const createConversationSchema = z.object({
  partnerId: objectId,
}).strict();

const sendMessageSchema = z.object({
  text: nonEmptyString,
  clientId: nonEmptyString.optional(),
}).strict();

function isParticipant(doc: any, userId: string): boolean {
  try { return (doc?.participants || []).map(String).includes(String(userId)); } catch { return false; }
}

r.post(
  '/conversations',
  ensureAuth as any,
  validateZod({ body: createConversationSchema }),
  async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const { partnerId } = req.body || {};
    if (!partnerId || partnerId === me) return res.status(400).json({ error: 'invalid partner' });
    const pair = [new Types.ObjectId(me), new Types.ObjectId(String(partnerId))].sort((a,b)=>a.toString().localeCompare(b.toString()));
    let t = await DMThread.findOne({ participants: pair });
    if (!t) {
      t = await DMThread.create({ participants: pair, unread: new Map([[String(partnerId), 0], [me, 0]]) } as any);
    }
    // Ensure unread map has keys for both participants
    try {
      const ids = (t?.participants || []).map(String);
      for (const p of ids) {
        if ((t as any).unread?.get?.(p) === undefined) (t as any).unread?.set?.(p, 0);
      }
      await t.save();
    } catch {}
    const payload = { id: String(t?._id), lastMessageText: t?.lastMessageText || '', lastMessageAt: t?.lastMessageAt || null, participants: (t?.participants||[]).map(String), unread: (t as any)?.unread?.get?.(me) ?? 0 };
    sseHub.publishMany(payload.participants, { type: 'chat:thread', payload });
    return res.json({ conversationId: payload.id });
  } catch (e) { return res.status(500).json({ error: 'internal' }); }
});

r.get('/conversations', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const list = await DMThread.find({ participants: me }).sort({ updatedAt: -1 }).limit(50).lean();
    return res.json({
      conversations: list.map(t=>({
        id: String(t._id),
        participants: (t.participants||[]).map(String),
        lastMessageText: t.lastMessageText||'',
        lastMessageAt: t.lastMessageAt||null,
        unread: (t as any)?.unread?.get?.(me) ?? 0,
        isPaused: Boolean((t as any)?.isPaused),
        safetyStatus: String((t as any)?.safetyStatus || 'green'),
      }))
    });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

r.get('/conversations/:id/messages', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const { id } = req.params;
    const t = await DMThread.findById(id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });
    const { cursor } = req.query as any;
    const q: any = { thread: id };
    if (cursor) q._id = { $lt: new Types.ObjectId(String(cursor)) };
    const msgs = await DMMessage.find(q).sort({ _id: -1 }).limit(30).lean();
    return res.json({ messages: msgs.reverse().map(m=>({ id: String(m._id), sender: String(m.sender), text: m.text, clientId: (m as any).clientId || null, createdAt: m.createdAt, flag: (m as any).flag || 'green' })) });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

r.post(
  '/conversations/:id/messages',
  ensureAuth as any,
  validateZod({ params: objectIdParam('id'), body: sendMessageSchema }),
  async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const { id } = req.params;
    const { text, clientId } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text_required' });
    const t = await DMThread.findById(id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });
    const isMentorSender = Boolean(req.user?.isMentor);
    if ((t as any)?.isPaused && !isMentorSender) {
      return res.status(423).json({ error: 'conversation_paused' });
    }
    const flag = await analyzeSafety(String(text));
    const m = await DMMessage.create({ thread: t._id, sender: me, text: String(text).trim(), clientId: clientId || null, readBy: [me], flag } as any);
    t.lastMessageText = m.text;
    t.lastMessageAt = new Date();
    // Update per-user unread counts
    for (const p of (t.participants || []).map(String)) {
      if ((t as any).unread?.get?.(p) === undefined) (t as any).unread?.set?.(p, 0);
      (t as any).unread?.set?.(p, p === me ? 0 : (((t as any).unread?.get?.(p) ?? 0) + 1));
    }
    await t.save();
    const payload = { threadId: String(t._id), message: { id: String(m._id), sender: me, text: m.text, clientId: clientId || null, createdAt: m.createdAt, status: 'delivered', flag } };
    sseHub.publishMany((t.participants||[]).map(String), { type: 'chat:message', payload });
    // send per-user unread with chat:thread
    for (const p of (t.participants || []).map(String)) {
      sseHub.publish(p, { type: 'chat:thread', payload: { id: String(t._id), lastMessageText: t.lastMessageText, lastMessageAt: t.lastMessageAt, participants: (t.participants||[]).map(String), unread: (t as any).unread?.get?.(p) ?? 0, isPaused: Boolean((t as any)?.isPaused), safetyStatus: String((t as any)?.safetyStatus || 'green') } });
    }
    const participants = (t.participants || []).map(String);
    const receiverId = participants.find((p) => p !== me);
    // Safety decisions
    if (flag === 'red') {
      (t as any).isPaused = true;
      (t as any).safetyStatus = 'red';
      const systemText = 'Mentoren er varslet.';
      const systemSender = receiverId || me;
      const sys = await DMMessage.create({
        thread: t._id,
        sender: systemSender,
        text: systemText,
        readBy: [systemSender],
        flag: 'red',
      } as any);
      t.lastMessageText = systemText;
      t.lastMessageAt = new Date();
      for (const p of participants) {
        if ((t as any).unread?.get?.(p) === undefined) (t as any).unread?.set?.(p, 0);
        (t as any).unread?.set?.(p, p === String(systemSender) ? 0 : (((t as any).unread?.get?.(p) ?? 0) + 1));
      }
      await t.save();
      const sysPayload = { threadId: String(t._id), message: { id: String(sys._id), sender: String(systemSender), text: sys.text, clientId: null, createdAt: sys.createdAt, status: 'delivered', flag: 'red' } };
      sseHub.publishMany(participants, { type: 'chat:message', payload: sysPayload });
      for (const p of participants) {
        sseHub.publish(p, { type: 'chat:thread', payload: { id: String(t._id), lastMessageText: t.lastMessageText, lastMessageAt: t.lastMessageAt, participants, unread: (t as any).unread?.get?.(p) ?? 0, isPaused: true, safetyStatus: 'red' } });
      }
      return res.status(201).json({ ok: true, id: String(m._id) });
    }
    if (flag === 'yellow' && (t as any).safetyStatus !== 'red') {
      (t as any).safetyStatus = 'yellow';
      await t.save();
    }
    if (flag === 'green' && !(t as any).isPaused && (t as any).safetyStatus !== 'red') {
      (t as any).safetyStatus = 'green';
      await t.save();
    }
    // If receiver is a mentor, trigger AI auto-reply
    if (receiverId) {
      void (async () => {
        try {
          const receiver = await User.findById(receiverId).select('isMentor').lean();
          if (!receiver?.isMentor) return;
          const aiText = await generateMentorResponse(me, receiverId, m.text);
          if (!aiText || !String(aiText).trim()) return;
          const aiMessage = await DMMessage.create({
            thread: t._id,
            sender: receiverId,
            text: String(aiText).trim(),
            readBy: [receiverId],
            flag: 'green',
          } as any);
          t.lastMessageText = aiMessage.text;
          t.lastMessageAt = new Date();
          for (const p of participants) {
            if ((t as any).unread?.get?.(p) === undefined) (t as any).unread?.set?.(p, 0);
            (t as any).unread?.set?.(p, p === receiverId ? 0 : (((t as any).unread?.get?.(p) ?? 0) + 1));
          }
          await t.save();
          const aiPayload = { threadId: String(t._id), message: { id: String(aiMessage._id), sender: receiverId, text: aiMessage.text, clientId: null, createdAt: aiMessage.createdAt, status: 'delivered', flag: 'green' } };
          sseHub.publishMany(participants, { type: 'chat:message', payload: aiPayload });
          for (const p of participants) {
            sseHub.publish(p, { type: 'chat:thread', payload: { id: String(t._id), lastMessageText: t.lastMessageText, lastMessageAt: t.lastMessageAt, participants, unread: (t as any).unread?.get?.(p) ?? 0, isPaused: Boolean((t as any)?.isPaused), safetyStatus: String((t as any)?.safetyStatus || 'green') } });
          }
        } catch (err) {
          try { console.error('[mentor-ai] auto-reply failed', err); } catch {}
        }
      })();
    }
    return res.status(201).json({ ok: true, id: String(m._id) });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

r.post(
  '/conversations/:id/resume',
  ensureAuth as any,
  validateZod({ params: objectIdParam('id'), body: z.object({}).strict() }),
  async (req: any, res) => {
  try {
    const me = String(req.user._id);
    if (!req.user?.isMentor) return res.status(403).json({ error: 'forbidden' });
    const { id } = req.params;
    const t = await DMThread.findById(id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });
    (t as any).isPaused = false;
    (t as any).safetyStatus = 'green';
    await t.save();
    const participants = (t.participants || []).map(String);
    for (const p of participants) {
      sseHub.publish(p, { type: 'chat:thread', payload: { id: String(t._id), lastMessageText: t.lastMessageText || '', lastMessageAt: t.lastMessageAt || null, participants, unread: (t as any).unread?.get?.(p) ?? 0, isPaused: false, safetyStatus: 'green' } });
    }
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

r.post(
  '/conversations/:id/read',
  ensureAuth as any,
  validateZod({ params: objectIdParam('id'), body: z.object({}).strict() }),
  async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const { id } = req.params;
    const t = await DMThread.findById(id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });
    // Mark messages read and clear unread count
    try {
      await DMMessage.updateMany({ thread: id, sender: { $ne: me } }, { $addToSet: { readBy: new Types.ObjectId(me) } } as any);
    } catch {}
    try {
      (t as any).unread?.set?.(me, 0);
      await t.save();
    } catch {}

    sseHub.publishMany((t.participants||[]).map(String), { type: 'chat:read', payload: { threadId: id, by: me } });
    // Push updated thread unread to reader
    sseHub.publish(me, { type: 'chat:thread', payload: { id: String(t._id), lastMessageText: t.lastMessageText || '', lastMessageAt: t.lastMessageAt || null, participants: (t.participants||[]).map(String), unread: 0 } });
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

export default r;


