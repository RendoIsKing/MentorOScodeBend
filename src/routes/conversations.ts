import { Router } from 'express';
import { Auth as ensureAuth, validateZod } from '../app/Middlewares';
import { Types } from 'mongoose';
import { sseHub, ssePush, getOnlineUserIds } from '../lib/sseHub';
import { createMulterInstance } from '../app/Middlewares/fileUpload';
import { ChatThread as DMThread } from '../models/chat';
import { ChatMessage as DMMessage } from '../models/chat';
import { User } from '../app/Models/User';
import { CoachKnowledge } from '../app/Models/CoachKnowledge';
import { z } from 'zod';
import { nonEmptyString, objectId, objectIdParam } from '../app/Validation/requestSchemas';
import { generateResponse as generateMentorResponse } from '../services/ai/mentorAIService';
import { analyzeSafety } from '../services/safety/trafficLight';
import * as Sentry from '@sentry/node';

const r = Router();

const createConversationSchema = z.object({
  partnerId: objectId,
}).strict();

const attachmentSchema = z.object({
  url: z.string(),
  type: z.string(),
  filename: z.string(),
});

const sendMessageSchema = z.object({
  text: nonEmptyString,
  clientId: nonEmptyString.optional(),
  attachments: z.array(attachmentSchema).optional(),
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
    const me = String(req.user?._id || '');
    const { partnerId } = req.body || {};
    console.log(`[chat:create] POST /conversations → me=${me}, userName=${req.user?.userName || 'unknown'}, partnerId=${partnerId}`);
    if (!me) return res.status(401).json({ error: 'not_authenticated' });
    if (!partnerId || partnerId === me) return res.status(400).json({ error: 'invalid partner' });

    let meOid: Types.ObjectId, partnerOid: Types.ObjectId;
    try {
      meOid = new Types.ObjectId(me);
      partnerOid = new Types.ObjectId(String(partnerId));
    } catch (idErr: any) {
      console.error('[chat:create] Invalid ObjectId:', { me, partnerId, error: idErr?.message });
      return res.status(400).json({ error: 'invalid_id', debug: { me, partnerId } });
    }

    const pair = [meOid, partnerOid].sort((a, b) => a.toString().localeCompare(b.toString()));
    console.log(`[chat:create] Looking for thread with participants: [${pair.map(String).join(',')}]`);

    let t: any;
    try {
      t = await DMThread.findOne({ participants: pair });
    } catch (findErr: any) {
      console.error('[chat:create] findOne failed:', findErr?.message, findErr?.stack);
      // Fallback: try finding with $all (order-independent)
      t = await DMThread.findOne({ participants: { $all: pair, $size: 2 } });
    }

    const isNew = !t;
    if (!t) {
      console.log('[chat:create] Creating new thread...');
      try {
        t = await DMThread.create({
          participants: pair,
          unread: Object.fromEntries([[String(partnerId), 0], [me, 0]]),
        } as any);
      } catch (createErr: any) {
        console.error('[chat:create] DMThread.create failed:', createErr?.message, createErr?.stack);
        return res.status(500).json({ error: 'create_failed', debug: { message: createErr?.message } });
      }
    }

    console.log(`[chat:create] → threadId=${String(t?._id)}, isNew=${isNew}, participants=[${(t?.participants || []).map(String).join(',')}]`);

    // Ensure unread map has keys for both participants
    try {
      const ids = (t?.participants || []).map(String);
      for (const p of ids) {
        if ((t as any).unread?.get?.(p) === undefined) (t as any).unread?.set?.(p, 0);
      }
      await t.save();
    } catch (saveErr: any) {
      console.error('[chat:create] unread save failed (non-fatal):', saveErr?.message);
    }

    const payload = {
      id: String(t?._id),
      lastMessageText: t?.lastMessageText || '',
      lastMessageAt: t?.lastMessageAt || null,
      participants: (t?.participants || []).map(String),
      unread: (t as any)?.unread?.get?.(me) ?? 0,
    };
    sseHub.publishMany(payload.participants, { type: 'chat:thread', payload });
    try { Sentry.addBreadcrumb({ category: 'chat', message: 'conversation-created', level: 'info', data: { threadId: payload.id, isNew } }); } catch {}
    return res.json({ conversationId: payload.id });
  } catch (e: any) {
    console.error('[chat:create] Unhandled 500 error:', e?.message || e, e?.stack);
    return res.status(500).json({ error: 'internal', debug: { message: e?.message || String(e) } });
  }
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
    return res.json({
      messages: msgs.reverse().map(m=>({
        id: String(m._id),
        sender: String(m.sender),
        text: m.text,
        clientId: (m as any).clientId || null,
        createdAt: m.createdAt,
        flag: (m as any).flag || 'green',
        flaggedCategories: (m as any).flaggedCategories || [],
        attachments: (m as any).attachments || [],
      }))
    });
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
    const { text, clientId, attachments: bodyAttachments } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text_required' });
    const t = await DMThread.findById(id);
    if (!t || !isParticipant(t, me)) {
      const participants = t ? (t.participants || []).map(String) : [];
      console.error(`[chat:403] POST /conversations/${id}/messages → FORBIDDEN. me=${me}, thread=${t ? 'found' : 'null'}, participants=[${participants.join(',')}], includes_me=${participants.includes(me)}, userName=${req.user?.userName || 'unknown'}`);
      return res.status(403).json({ error: 'forbidden', debug: { threadFound: !!t, me, participants } });
    }
    const isMentorSender = Boolean(req.user?.isMentor);
    if ((t as any)?.isPaused && !isMentorSender) {
      return res.status(423).json({ error: 'conversation_paused' });
    }
    const safety = await analyzeSafety(String(text));
    const flag = safety.status;
    const m = await DMMessage.create({
      thread: t._id,
      sender: me,
      text: String(text).trim(),
      clientId: clientId || null,
      readBy: [me],
      flag,
      flaggedCategories: safety.flaggedCategories || [],
      attachments: Array.isArray(bodyAttachments) ? bodyAttachments : [],
    } as any);
    t.lastMessageText = m.text;
    t.lastMessageAt = new Date();
    // Update per-user unread counts
    for (const p of (t.participants || []).map(String)) {
      if ((t as any).unread?.get?.(p) === undefined) (t as any).unread?.set?.(p, 0);
      (t as any).unread?.set?.(p, p === me ? 0 : (((t as any).unread?.get?.(p) ?? 0) + 1));
    }
    await t.save();
    const payload = {
      threadId: String(t._id),
      message: {
        id: String(m._id),
        sender: me,
        text: m.text,
        clientId: clientId || null,
        createdAt: m.createdAt,
        status: 'delivered',
        flag,
        flaggedCategories: (m as any).flaggedCategories || [],
        attachments: (m as any).attachments || [],
      }
    };
    sseHub.publishMany((t.participants||[]).map(String), { type: 'chat:message', payload });
    try { Sentry.addBreadcrumb({ category: 'chat', message: 'message-sent', level: 'info', data: { threadId: String(t._id), flag, sender: me } }); } catch {}
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
        flaggedCategories: safety.flaggedCategories || [],
      } as any);
      t.lastMessageText = systemText;
      t.lastMessageAt = new Date();
      for (const p of participants) {
        if ((t as any).unread?.get?.(p) === undefined) (t as any).unread?.set?.(p, 0);
        (t as any).unread?.set?.(p, p === String(systemSender) ? 0 : (((t as any).unread?.get?.(p) ?? 0) + 1));
      }
      await t.save();
      const sysPayload = {
        threadId: String(t._id),
        message: {
          id: String(sys._id),
          sender: String(systemSender),
          text: sys.text,
          clientId: null,
          createdAt: sys.createdAt,
          status: 'delivered',
          flag: 'red',
          flaggedCategories: (sys as any).flaggedCategories || [],
        }
      };
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
      console.log(`[mentor-ai] ── Auto-reply check START for thread=${String(t._id)}, sender=${me}, receiver=${receiverId} ──`);
      void (async () => {
        try {
          const receiver = await User.findById(receiverId).select('isMentor userName').lean();
          console.log(`[mentor-ai] Receiver lookup: id=${receiverId}, found=${!!receiver}, isMentor=${receiver?.isMentor}, userName=${(receiver as any)?.userName}`);
          let actAsMentor = Boolean(receiver?.isMentor);
          // Fallback: if the receiver has knowledge base documents, treat as a mentor
          if (!actAsMentor) {
            try {
              const kbCount = await CoachKnowledge.countDocuments({ userId: receiverId });
              console.log(`[mentor-ai] KB fallback check: ${kbCount} documents found for receiver ${receiverId}`);
              if (kbCount > 0) {
                actAsMentor = true;
                console.log(`[mentor-ai] Treating as mentor via KB fallback, auto-fixing isMentor flag`);
                await User.updateOne({ _id: receiverId }, { $set: { isMentor: true } });
              }
            } catch (kbErr: any) {
              console.error(`[mentor-ai] KB fallback check failed:`, kbErr?.message || kbErr);
            }
          }
          if (!actAsMentor) {
            console.log(`[mentor-ai] ── Receiver is NOT a mentor, skipping AI reply ──`);
            return;
          }
          console.log(`[mentor-ai] Generating AI response for mentor ${receiverId}, message: "${String(m.text).slice(0, 60)}..."`);
          const startTime = Date.now();
          const aiText = await generateMentorResponse(me, receiverId, m.text);
          const elapsed = Date.now() - startTime;
          console.log(`[mentor-ai] AI response generated in ${elapsed}ms (${String(aiText || '').length} chars)`);
          if (!aiText || !String(aiText).trim()) {
            console.log(`[mentor-ai] ── AI returned empty response, not saving ──`);
            return;
          }
          // Re-fetch the thread to avoid stale data race conditions
          const freshThread = await DMThread.findById(t._id);
          if (!freshThread) {
            console.error(`[mentor-ai] Thread ${String(t._id)} no longer exists`);
            return;
          }
          const aiMessage = await DMMessage.create({
            thread: freshThread._id,
            sender: receiverId,
            text: String(aiText).trim(),
            readBy: [receiverId],
            flag: 'green',
          } as any);
          freshThread.lastMessageText = aiMessage.text;
          freshThread.lastMessageAt = new Date();
          for (const p of participants) {
            if ((freshThread as any).unread?.get?.(p) === undefined) (freshThread as any).unread?.set?.(p, 0);
            (freshThread as any).unread?.set?.(p, p === receiverId ? 0 : (((freshThread as any).unread?.get?.(p) ?? 0) + 1));
          }
          await freshThread.save();
          console.log(`[mentor-ai] AI message saved: id=${String(aiMessage._id)}`);
          const aiPayload = {
            threadId: String(freshThread._id),
            message: {
              id: String(aiMessage._id),
              sender: receiverId,
              text: aiMessage.text,
              clientId: null,
              createdAt: aiMessage.createdAt,
              status: 'delivered',
              flag: 'green',
              flaggedCategories: [],
            }
          };
          sseHub.publishMany(participants, { type: 'chat:message', payload: aiPayload });
          for (const p of participants) {
            sseHub.publish(p, { type: 'chat:thread', payload: { id: String(freshThread._id), lastMessageText: freshThread.lastMessageText, lastMessageAt: freshThread.lastMessageAt, participants, unread: (freshThread as any).unread?.get?.(p) ?? 0, isPaused: Boolean((freshThread as any)?.isPaused), safetyStatus: String((freshThread as any)?.safetyStatus || 'green') } });
          }
          console.log(`[mentor-ai] ── Auto-reply COMPLETE for thread=${String(freshThread._id)} ──`);
        } catch (err: any) {
          console.error('[mentor-ai] ── Auto-reply FAILED ──', receiverId, ':', err?.message || err);
          console.error('[mentor-ai] Stack:', err?.stack);
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

// ── Chat image upload ──
const chatUpload = createMulterInstance('public/uploads/chat');
r.post(
  '/chat-upload',
  ensureAuth as any,
  chatUpload.single('image'),
  (req: any, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'no_file' });
      const url = file.location || `uploads/chat/${file.filename}`;
      return res.json({
        url: url.startsWith('http') ? url : `/api/backend/${url}`,
        type: file.mimetype,
        filename: file.originalname,
      });
    } catch { return res.status(500).json({ error: 'upload_failed' }); }
  }
);

// ── Online status (in-memory check, no DB) ──
r.get('/online-status', ensureAuth as any, (req: any, res) => {
  try {
    const raw = String(req.query?.userIds || '');
    const ids = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
    const online = getOnlineUserIds(ids);
    return res.json({ online });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

// ── Typing indicator (fire-and-forget, no DB write) ──
r.post(
  '/conversations/:id/typing',
  ensureAuth as any,
  async (req: any, res) => {
  try {
    const me = String(req.user._id);
    const { id } = req.params;
    const t = await DMThread.findById(id).select('participants').lean();
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });
    const others = (t.participants || []).map(String).filter((p) => p !== me);
    const payload = { threadId: String(t._id), userId: me };
    for (const uid of others) {
      ssePush(uid, 'chat:typing', payload);
    }
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

// ── Diagnostic endpoint: test the AI pipeline step-by-step ──
// GET /chat/debug-ai?userName=Coach.Majen&testMessage=hello
r.get('/debug-ai', async (req: any, res) => {
  const steps: Array<{ step: string; ok: boolean; detail: string; ms?: number }> = [];
  const userName = String(req.query?.userName || 'Coach.Majen');
  const testMessage = String(req.query?.testMessage || 'Hei, kan du hjelpe meg?');

  // Step 1: Find the mentor user
  let mentorId = '';
  try {
    const start = Date.now();
    const escaped = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentor = await User.findOne({ userName: { $regex: `^${escaped}$`, $options: 'i' } }).select('_id userName isMentor').lean();
    steps.push({ step: '1_find_mentor', ok: !!mentor, detail: mentor ? `id=${String(mentor._id)}, userName=${(mentor as any).userName}, isMentor=${(mentor as any).isMentor}` : `No user found for "${userName}"`, ms: Date.now() - start });
    if (mentor) mentorId = String(mentor._id);
  } catch (err: any) {
    steps.push({ step: '1_find_mentor', ok: false, detail: err?.message || String(err) });
  }

  if (!mentorId) return res.json({ steps });

  // Step 2: Check KB documents
  try {
    const start = Date.now();
    const count = await CoachKnowledge.countDocuments({ userId: mentorId });
    const sample = await CoachKnowledge.find({ userId: mentorId }).select('title classification').limit(3).lean();
    steps.push({ step: '2_kb_documents', ok: count > 0, detail: `${count} docs. Sample: ${sample.map((d: any) => `"${d.title}" (${d.classification || 'unclassified'})`).join(', ')}`, ms: Date.now() - start });
  } catch (err: any) {
    steps.push({ step: '2_kb_documents', ok: false, detail: err?.message || String(err) });
  }

  // Step 3: Test embedding generation
  try {
    const start = Date.now();
    const { generateEmbedding } = await import('../services/ai/embeddingService');
    const vec = await generateEmbedding('test query');
    steps.push({ step: '3_embedding', ok: vec.length > 0, detail: `Embedding vector length: ${vec.length}`, ms: Date.now() - start });
  } catch (err: any) {
    steps.push({ step: '3_embedding', ok: false, detail: err?.message || String(err) });
  }

  // Step 4: Test RAG retrieval
  try {
    const start = Date.now();
    const { retrieveContext } = await import('../services/ai/ragService');
    const docs = await retrieveContext(testMessage, mentorId);
    steps.push({ step: '4_rag_retrieval', ok: true, detail: `${docs.length} docs: [${docs.map(d => `"${d.title}"`).join(', ')}]`, ms: Date.now() - start });
  } catch (err: any) {
    steps.push({ step: '4_rag_retrieval', ok: false, detail: err?.message || String(err) });
  }

  // Step 5: Test OpenAI chat completion (short response)
  try {
    const start = Date.now();
    const aiText = await generateMentorResponse('debug-user', mentorId, testMessage);
    steps.push({ step: '5_openai_response', ok: !!aiText && aiText.trim().length > 0, detail: `${aiText.length} chars: "${aiText.slice(0, 120)}..."`, ms: Date.now() - start });
  } catch (err: any) {
    steps.push({ step: '5_openai_response', ok: false, detail: err?.message || String(err) });
  }

  // Step 6: Test safety analysis
  try {
    const start = Date.now();
    const safety = await analyzeSafety(testMessage);
    steps.push({ step: '6_safety_analysis', ok: true, detail: `status=${safety.status}, flagged=[${safety.flaggedCategories.join(',')}]`, ms: Date.now() - start });
  } catch (err: any) {
    steps.push({ step: '6_safety_analysis', ok: false, detail: err?.message || String(err) });
  }

  return res.json({ userName, mentorId, testMessage, steps });
});

export default r;