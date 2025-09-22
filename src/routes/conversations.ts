import { Router } from 'express';
import { Auth as ensureAuth } from '../app/Middlewares';
import { Types } from 'mongoose';
import { sseHub } from '../lib/sseHub';
import { ChatThread as DMThread } from '../models/chat';
import { ChatMessage as DMMessage } from '../models/chat';

const r = Router();

function isParticipant(doc: any, userId: string): boolean {
  try { return (doc?.participants || []).map(String).includes(String(userId)); } catch { return false; }
}

r.post('/conversations', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const { partnerId } = req.body || {};
    if (!partnerId || partnerId === me) return res.status(400).json({ error: 'invalid partner' });
    const pair = [new Types.ObjectId(me), new Types.ObjectId(String(partnerId))].sort((a,b)=>a.toString().localeCompare(b.toString()));
    let t = await DMThread.findOne({ participants: pair });
    if (!t) t = await (await DMThread.create({ participants: pair })).populate?.('participants') || await DMThread.findOne({ participants: pair });
    const payload = { id: String(t?._id), lastMessageText: t?.lastMessageText || '', lastMessageAt: t?.lastMessageAt || null, participants: (t?.participants||[]).map(String) };
    sseHub.publishMany(payload.participants, { type: 'chat:thread', payload });
    return res.json({ conversationId: payload.id });
  } catch (e) { return res.status(500).json({ error: 'internal' }); }
});

r.get('/conversations', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const list = await DMThread.find({ participants: me }).sort({ updatedAt: -1 }).limit(50).lean();
    return res.json({ conversations: list.map(t=>({ id: String(t._id), participants: (t.participants||[]).map(String), lastMessageText: t.lastMessageText||'', lastMessageAt: t.lastMessageAt||null, unread: 0 })) });
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
    return res.json({ messages: msgs.reverse().map(m=>({ id: String(m._id), sender: String(m.sender), text: m.text, clientId: (m as any).clientId || null, createdAt: m.createdAt })) });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

r.post('/conversations/:id/messages', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const { id } = req.params;
    const { text, clientId } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text_required' });
    const t = await DMThread.findById(id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });
    const m = await DMMessage.create({ thread: t._id, sender: me, text: String(text).trim(), clientId, readBy: [me] } as any);
    t.lastMessageText = m.text; t.lastMessageAt = new Date(); await t.save();
    const payload = { threadId: String(t._id), message: { id: String(m._id), sender: me, text: m.text, clientId: clientId || null, createdAt: m.createdAt, status: 'delivered' } };
    sseHub.publishMany((t.participants||[]).map(String), { type: 'chat:message', payload });
    sseHub.publishMany((t.participants||[]).map(String), { type: 'chat:thread', payload: { id: String(t._id), lastMessageText: t.lastMessageText, lastMessageAt: t.lastMessageAt, participants: (t.participants||[]).map(String) } });
    return res.status(201).json({ ok: true, id: String(m._id) });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

r.post('/conversations/:id/read', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const { id } = req.params;
    const t = await DMThread.findById(id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });
    sseHub.publishMany((t.participants||[]).map(String), { type: 'chat:read', payload: { threadId: id, by: me } });
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

export default r;


