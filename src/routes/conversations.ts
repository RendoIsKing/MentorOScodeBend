import { Router } from 'express';
import { Auth as ensureAuth, validateZod } from '../app/Middlewares';
import { db, findById, findMany, insertOne, updateById, count, Tables } from '../lib/db';
import { sseHub, ssePush, getOnlineUserIds } from '../lib/sseHub';
import { createMulterInstance, uploadToSupabase } from '../app/Middlewares/fileUpload';
import { z } from 'zod';
import { nonEmptyString } from '../app/Validation/requestSchemas';
import { generateResponse as generateMentorResponse } from '../services/ai/mentorAIService';
import { analyzeSafety } from '../services/safety/trafficLight';
import * as Sentry from '@sentry/node';

const r = Router();

// ── Validation helpers (UUID-based) ─────────────────────────────────────────
const uuidString = z.string().uuid();
const uuidParam = (key: string = 'id') =>
  z.object({ [key]: uuidString } as Record<string, z.ZodTypeAny>).strict();

const createConversationSchema = z.object({
  partnerId: uuidString,
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

// ── POST /conversations — create or find a DM thread ────────────────────────
r.post(
  '/conversations',
  ensureAuth as any,
  validateZod({ body: createConversationSchema }),
  async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || '');
    const { partnerId } = req.body || {};
    console.log(`[chat:create] POST /conversations -> me=${me}, userName=${req.user?.userName || 'unknown'}, partnerId=${partnerId}`);
    if (!me) return res.status(401).json({ error: 'not_authenticated' });
    if (!partnerId || partnerId === me) return res.status(400).json({ error: 'invalid partner' });

    const pair = [me, String(partnerId)].sort();
    console.log(`[chat:create] Looking for thread with participants: [${pair.join(',')}]`);

    // Find existing thread containing both participants
    const { data: existing } = await db
      .from(Tables.CHAT_THREADS)
      .select('*')
      .contains('participants', pair)
      .limit(1)
      .maybeSingle();

    let t = existing;
    const isNew = !t;

    if (!t) {
      console.log('[chat:create] Creating new thread...');
      const unread: Record<string, number> = { [String(partnerId)]: 0, [me]: 0 };
      t = await insertOne(Tables.CHAT_THREADS, {
        participants: pair,
        last_message_at: new Date().toISOString(),
        unread,
      });
      if (!t) {
        return res.status(500).json({ error: 'create_failed' });
      }
    }

    console.log(`[chat:create] -> threadId=${t.id}, isNew=${isNew}, participants=[${(t.participants || []).join(',')}]`);

    // Ensure unread JSONB has keys for both participants
    try {
      const unread = { ...(t.unread || {}) };
      let needsUpdate = false;
      for (const p of (t.participants || [])) {
        if (unread[p] === undefined) { unread[p] = 0; needsUpdate = true; }
      }
      if (needsUpdate) {
        await updateById(Tables.CHAT_THREADS, t.id, { unread });
      }
    } catch (saveErr: any) {
      console.error('[chat:create] unread save failed (non-fatal):', saveErr?.message);
    }

    const payload = {
      id: t.id,
      lastMessageText: t.last_message_text || '',
      lastMessageAt: t.last_message_at || null,
      participants: t.participants || [],
      unread: t.unread?.[me] ?? 0,
    };
    sseHub.publishMany(payload.participants, { type: 'chat:thread', payload });
    try { Sentry.addBreadcrumb({ category: 'chat', message: 'conversation-created', level: 'info', data: { threadId: payload.id, isNew } }); } catch {}

    // Send an automatic welcome message from the mentor for NEW conversations
    if (isNew) {
      void (async () => {
        try {
          const receiver = await findById(Tables.USERS, String(partnerId), 'id, is_mentor, user_name, first_name');
          if (!receiver?.is_mentor) return;

          console.log(`[chat:welcome] Generating welcome message from mentor ${partnerId} for new user ${me}`);
          const welcomePrompt = `Den nye brukeren har nettopp startet en samtale med deg. ` +
            `Send en varm velkomstmelding. Presenter deg selv, oppsummer hva du vet om brukeren ` +
            `fra onboarding-dataen deres, fortell dem hva som kommer til å skje videre ` +
            `(du vil bli kjent med dem, stille noen spørsmål, og så lage en personlig plan), ` +
            `og spør om det er noe viktig de vil at du skal vite før dere begynner.`;

          const aiText = await generateMentorResponse(me, String(partnerId), welcomePrompt);
          if (!aiText || !String(aiText).trim()) return;

          const welcomeMsg = await insertOne(Tables.CHAT_MESSAGES, {
            thread_id: t.id,
            sender: String(partnerId),
            text: String(aiText).trim(),
            read_by: [String(partnerId)],
            flag: 'green',
          });
          if (!welcomeMsg) return;

          const now = new Date().toISOString();
          const unreadUpdate = { ...(t.unread || {}), [me]: ((t.unread || {})[me] ?? 0) + 1 };
          await updateById(Tables.CHAT_THREADS, t.id, {
            last_message_text: String(aiText).trim().slice(0, 200),
            last_message_at: now,
            unread: unreadUpdate,
          });

          const welcomePayload = {
            type: 'chat:message',
            payload: {
              threadId: t.id,
              message: {
                id: welcomeMsg.id,
                sender: String(partnerId),
                text: String(aiText).trim(),
                clientId: null,
                createdAt: welcomeMsg.created_at,
                status: 'delivered',
                flag: 'green',
              },
            },
          };
          sseHub.publishMany(t.participants, welcomePayload);
          console.log(`[chat:welcome] Welcome message sent successfully`);
        } catch (err: any) {
          console.error('[chat:welcome] Failed to send welcome message:', err?.message || err);
        }
      })();
    }

    return res.json({ conversationId: payload.id });
  } catch (e: any) {
    console.error('[chat:create] Unhandled 500 error:', e?.message || e, e?.stack);
    return res.status(500).json({ error: 'internal', debug: { message: e?.message || String(e) } });
  }
});

// ── GET /conversations — list my conversations ──────────────────────────────
r.get('/conversations', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || '');
    const { data: list } = await db
      .from(Tables.CHAT_THREADS)
      .select('*')
      .contains('participants', [me])
      .order('last_message_at', { ascending: false })
      .limit(50);
    return res.json({
      conversations: (list || []).map((t: any) => ({
        id: t.id,
        participants: t.participants || [],
        lastMessageText: t.last_message_text || '',
        lastMessageAt: t.last_message_at || null,
        unread: t.unread?.[me] ?? 0,
        isPaused: Boolean(t.is_paused),
        safetyStatus: String(t.safety_status || 'green'),
      }))
    });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

// ── GET /conversations/:id/messages — paginated message history ─────────────
r.get('/conversations/:id/messages', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || '');
    const { id } = req.params;
    const t = await findById(Tables.CHAT_THREADS, id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });

    const { cursor } = req.query as any;
    let query = db.from(Tables.CHAT_MESSAGES).select('*').eq('thread_id', id);

    if (cursor) {
      // cursor is a message ID; resolve its created_at for keyset pagination
      const cursorMsg = await findById(Tables.CHAT_MESSAGES, cursor, 'created_at');
      if (cursorMsg) {
        query = query.lt('created_at', cursorMsg.created_at);
      }
    }

    const { data: msgs } = await query
      .order('created_at', { ascending: false })
      .limit(30);

    const sorted = (msgs || []).reverse();
    return res.json({
      messages: sorted.map((m: any) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        clientId: m.client_id || null,
        createdAt: m.created_at,
        flag: m.flag || 'green',
        flaggedCategories: m.flagged_categories || [],
        attachments: m.attachments || [],
      }))
    });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

// ── GET /conversations/:id/messages/mentor-view — mentor reads a subscriber's chat ──
r.get('/conversations/:id/messages/mentor-view', ensureAuth as any, async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || '');
    if (!req.user?.isMentor) return res.status(403).json({ error: 'forbidden: not a mentor' });

    const { id } = req.params;
    const t = await findById(Tables.CHAT_THREADS, id);
    if (!t) return res.status(404).json({ error: 'thread not found' });

    // Verify the mentor owns a subscription plan that one of the thread participants is subscribed to
    const participants = (t.participants || []).map(String);
    const { data: plans } = await db.from(Tables.SUBSCRIPTION_PLANS).select('id').eq('user_id', me);
    const planIds = (plans || []).map((p: any) => p.id);
    let authorized = false;
    if (planIds.length > 0) {
      const { data: subs } = await db.from(Tables.SUBSCRIPTIONS).select('user_id').in('plan_id', planIds).eq('status', 'active');
      const subscriberIds = new Set((subs || []).map((s: any) => String(s.user_id)));
      authorized = participants.some((p) => subscriberIds.has(p));
    }
    if (!authorized) return res.status(403).json({ error: 'forbidden: student is not your subscriber' });

    const { cursor } = req.query as any;
    let query = db.from(Tables.CHAT_MESSAGES).select('*').eq('thread_id', id);
    if (cursor) {
      const cursorMsg = await findById(Tables.CHAT_MESSAGES, cursor, 'created_at');
      if (cursorMsg) {
        query = query.lt('created_at', cursorMsg.created_at);
      }
    }

    const { data: msgs } = await query.order('created_at', { ascending: false }).limit(50);
    const sorted = (msgs || []).reverse();
    return res.json({
      messages: sorted.map((m: any) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        clientId: m.client_id || null,
        createdAt: m.created_at,
        flag: m.flag || 'green',
        flaggedCategories: m.flagged_categories || [],
        attachments: m.attachments || [],
      }))
    });
  } catch (err) {
    console.error('[mentor-view] Error:', err);
    return res.status(500).json({ error: 'internal' });
  }
});

// ── POST /conversations/:id/messages — send a message ───────────────────────
r.post(
  '/conversations/:id/messages',
  ensureAuth as any,
  validateZod({ params: uuidParam('id'), body: sendMessageSchema }),
  async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || '');
    const { id } = req.params;
    const { text, clientId, attachments: bodyAttachments } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text_required' });

    const t = await findById(Tables.CHAT_THREADS, id);
    if (!t || !isParticipant(t, me)) {
      const participants = t ? (t.participants || []) : [];
      console.error(`[chat:403] POST /conversations/${id}/messages -> FORBIDDEN. me=${me}, thread=${t ? 'found' : 'null'}, participants=[${participants.join(',')}], includes_me=${participants.includes(me)}, userName=${req.user?.userName || 'unknown'}`);
      return res.status(403).json({ error: 'forbidden', debug: { threadFound: !!t, me, participants } });
    }

    const isMentorSender = Boolean(req.user?.isMentor);
    if (t.is_paused && !isMentorSender) {
      return res.status(423).json({ error: 'conversation_paused' });
    }

    const safety = await analyzeSafety(String(text));
    const flag = safety.status;

    const m = await insertOne(Tables.CHAT_MESSAGES, {
      thread_id: t.id,
      sender: me,
      text: String(text).trim(),
      client_id: clientId || null,
      read_by: [me],
      flag,
      flagged_categories: safety.flaggedCategories || [],
      attachments: Array.isArray(bodyAttachments) ? bodyAttachments : [],
    });
    if (!m) return res.status(500).json({ error: 'send_failed' });

    // Update thread metadata & per-user unread counts
    const now = new Date().toISOString();
    const unread: Record<string, number> = { ...(t.unread || {}) };
    for (const p of (t.participants || [])) {
      unread[p] = p === me ? 0 : (unread[p] ?? 0) + 1;
    }
    await updateById(Tables.CHAT_THREADS, id, {
      last_message_text: m.text,
      last_message_at: now,
      unread,
    });

    const msgPayload = {
      threadId: t.id,
      message: {
        id: m.id,
        sender: me,
        text: m.text,
        clientId: clientId || null,
        createdAt: m.created_at,
        status: 'delivered',
        flag,
        flaggedCategories: m.flagged_categories || [],
        attachments: m.attachments || [],
      }
    };
    const participants = (t.participants || []);
    sseHub.publishMany(participants, { type: 'chat:message', payload: msgPayload });
    try { Sentry.addBreadcrumb({ category: 'chat', message: 'message-sent', level: 'info', data: { threadId: t.id, flag, sender: me } }); } catch {}

    // Send per-user unread with chat:thread
    for (const p of participants) {
      sseHub.publish(p, { type: 'chat:thread', payload: { id: t.id, lastMessageText: m.text, lastMessageAt: now, participants, unread: unread[p] ?? 0, isPaused: Boolean(t.is_paused), safetyStatus: String(t.safety_status || 'green') } });
    }

    const receiverId = participants.find((p: string) => p !== me);

    // ── Safety decisions ──
    if (flag === 'red') {
      const systemText = 'Mentoren er varslet.';
      const systemSender = receiverId || me;
      const sys = await insertOne(Tables.CHAT_MESSAGES, {
        thread_id: t.id,
        sender: systemSender,
        text: systemText,
        read_by: [systemSender],
        flag: 'red',
        flagged_categories: safety.flaggedCategories || [],
      });

      const sysNow = new Date().toISOString();
      const sysUnread: Record<string, number> = { ...unread };
      for (const p of participants) {
        sysUnread[p] = p === String(systemSender) ? 0 : (sysUnread[p] ?? 0) + 1;
      }
      await updateById(Tables.CHAT_THREADS, id, {
        is_paused: true,
        safety_status: 'red',
        last_message_text: systemText,
        last_message_at: sysNow,
        unread: sysUnread,
      });

      if (sys) {
        const sysPayload = {
          threadId: t.id,
          message: {
            id: sys.id,
            sender: String(systemSender),
            text: sys.text,
            clientId: null,
            createdAt: sys.created_at,
            status: 'delivered',
            flag: 'red',
            flaggedCategories: sys.flagged_categories || [],
          }
        };
        sseHub.publishMany(participants, { type: 'chat:message', payload: sysPayload });
      }
      for (const p of participants) {
        sseHub.publish(p, { type: 'chat:thread', payload: { id: t.id, lastMessageText: systemText, lastMessageAt: sysNow, participants, unread: sysUnread[p] ?? 0, isPaused: true, safetyStatus: 'red' } });
      }
      return res.status(201).json({ ok: true, id: m.id });
    }

    if (flag === 'yellow' && t.safety_status !== 'red') {
      await updateById(Tables.CHAT_THREADS, id, { safety_status: 'yellow' });
    }
    if (flag === 'green' && !t.is_paused && t.safety_status !== 'red') {
      await updateById(Tables.CHAT_THREADS, id, { safety_status: 'green' });
    }

    // ── If receiver is a mentor, trigger AI auto-reply ──
    if (receiverId) {
      console.log(`[mentor-ai] -- Auto-reply check START for thread=${t.id}, sender=${me}, receiver=${receiverId} --`);
      void (async () => {
        try {
          const receiver = await findById(Tables.USERS, receiverId, 'id, is_mentor, user_name');
          console.log(`[mentor-ai] Receiver lookup: id=${receiverId}, found=${!!receiver}, isMentor=${receiver?.is_mentor}, userName=${receiver?.user_name}`);
          let actAsMentor = Boolean(receiver?.is_mentor);

          // Fallback: if the receiver has knowledge base documents, treat as a mentor
          if (!actAsMentor) {
            try {
              const kbCount = await count(Tables.COACH_KNOWLEDGE, { user_id: receiverId });
              console.log(`[mentor-ai] KB fallback check: ${kbCount} documents found for receiver ${receiverId}`);
              if (kbCount > 0) {
                actAsMentor = true;
                console.log(`[mentor-ai] Treating as mentor via KB fallback, auto-fixing is_mentor flag`);
                await updateById(Tables.USERS, receiverId, { is_mentor: true });
              }
            } catch (kbErr: any) {
              console.error(`[mentor-ai] KB fallback check failed:`, kbErr?.message || kbErr);
            }
          }

          if (!actAsMentor) {
            console.log(`[mentor-ai] -- Receiver is NOT a mentor, skipping AI reply --`);
            return;
          }

          // Load recent conversation history so the AI has context
          let conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];
          try {
            const { data: recentMsgs } = await db
              .from(Tables.CHAT_MESSAGES)
              .select('sender, text')
              .eq('thread_id', t.id)
              .order('created_at', { ascending: false })
              .limit(20);
            if (recentMsgs && recentMsgs.length > 1) {
              conversationHistory = (recentMsgs as any[])
                .reverse()
                .slice(0, -1) // exclude the current message (already passed separately)
                .map((msg: any) => ({
                  role: (String(msg.sender) === me ? 'user' : 'assistant') as 'user' | 'assistant',
                  content: String(msg.text || ''),
                }))
                .filter(m => m.content.trim());
            }
          } catch (histErr: any) {
            console.warn(`[mentor-ai] Failed to load conversation history:`, histErr?.message);
          }

          console.log(`[mentor-ai] Generating AI response for mentor ${receiverId}, message: "${String(m.text).slice(0, 60)}...", history: ${conversationHistory.length} msgs`);
          const startTime = Date.now();
          const aiText = await generateMentorResponse(me, receiverId, m.text, m.attachments, conversationHistory);
          const elapsed = Date.now() - startTime;
          console.log(`[mentor-ai] AI response generated in ${elapsed}ms (${String(aiText || '').length} chars)`);

          if (!aiText || !String(aiText).trim()) {
            console.log(`[mentor-ai] -- AI returned empty response, not saving --`);
            return;
          }

          // Re-fetch the thread to avoid stale data race conditions
          const freshThread = await findById(Tables.CHAT_THREADS, t.id);
          if (!freshThread) {
            console.error(`[mentor-ai] Thread ${t.id} no longer exists`);
            return;
          }

          const aiMessage = await insertOne(Tables.CHAT_MESSAGES, {
            thread_id: freshThread.id,
            sender: receiverId,
            text: String(aiText).trim(),
            read_by: [receiverId],
            flag: 'green',
          });
          if (!aiMessage) return;

          const aiNow = new Date().toISOString();
          const freshUnread: Record<string, number> = { ...(freshThread.unread || {}) };
          for (const p of participants) {
            freshUnread[p] = p === receiverId ? 0 : (freshUnread[p] ?? 0) + 1;
          }
          await updateById(Tables.CHAT_THREADS, freshThread.id, {
            last_message_text: aiMessage.text,
            last_message_at: aiNow,
            unread: freshUnread,
          });

          console.log(`[mentor-ai] AI message saved: id=${aiMessage.id}`);

          const aiPayload = {
            threadId: freshThread.id,
            message: {
              id: aiMessage.id,
              sender: receiverId,
              text: aiMessage.text,
              clientId: null,
              createdAt: aiMessage.created_at,
              status: 'delivered',
              flag: 'green',
              flaggedCategories: [],
            }
          };
          sseHub.publishMany(participants, { type: 'chat:message', payload: aiPayload });
          for (const p of participants) {
            sseHub.publish(p, { type: 'chat:thread', payload: { id: freshThread.id, lastMessageText: aiMessage.text, lastMessageAt: aiNow, participants, unread: freshUnread[p] ?? 0, isPaused: Boolean(freshThread.is_paused), safetyStatus: String(freshThread.safety_status || 'green') } });
          }
          console.log(`[mentor-ai] -- Auto-reply COMPLETE for thread=${freshThread.id} --`);
        } catch (err: any) {
          console.error('[mentor-ai] -- Auto-reply FAILED --', receiverId, ':', err?.message || err);
          console.error('[mentor-ai] Stack:', err?.stack);
        }
      })();
    }

    return res.status(201).json({ ok: true, id: m.id });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

// ── POST /conversations/:id/resume — mentor resumes a paused conversation ───
r.post(
  '/conversations/:id/resume',
  ensureAuth as any,
  validateZod({ params: uuidParam('id'), body: z.object({}).strict() }),
  async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || '');
    if (!req.user?.isMentor) return res.status(403).json({ error: 'forbidden' });
    const { id } = req.params;
    const t = await findById(Tables.CHAT_THREADS, id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });

    await updateById(Tables.CHAT_THREADS, id, { is_paused: false, safety_status: 'green' });

    const participants = t.participants || [];
    for (const p of participants) {
      sseHub.publish(p, { type: 'chat:thread', payload: { id: t.id, lastMessageText: t.last_message_text || '', lastMessageAt: t.last_message_at || null, participants, unread: t.unread?.[p] ?? 0, isPaused: false, safetyStatus: 'green' } });
    }
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

// ── POST /conversations/:id/read — mark messages as read ────────────────────
r.post(
  '/conversations/:id/read',
  ensureAuth as any,
  validateZod({ params: uuidParam('id'), body: z.object({}).strict() }),
  async (req: any, res) => {
  try {
    const me = String(req.user?._id || req.user?.id || '');
    const { id } = req.params;
    const t = await findById(Tables.CHAT_THREADS, id);
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });

    // Add me to read_by for messages sent by others (no atomic array_append via JS client)
    try {
      const { data: unreadMsgs } = await db
        .from(Tables.CHAT_MESSAGES)
        .select('id, read_by')
        .eq('thread_id', id)
        .neq('sender', me);

      if (unreadMsgs) {
        for (const msg of unreadMsgs) {
          const readBy: string[] = msg.read_by || [];
          if (!readBy.includes(me)) {
            await db.from(Tables.CHAT_MESSAGES).update({ read_by: [...readBy, me] }).eq('id', msg.id);
          }
        }
      }
    } catch {}

    // Clear unread count for this user
    try {
      const unread = { ...(t.unread || {}), [me]: 0 };
      await updateById(Tables.CHAT_THREADS, id, { unread });
    } catch {}

    const participants = t.participants || [];
    sseHub.publishMany(participants, { type: 'chat:read', payload: { threadId: id, by: me } });
    sseHub.publish(me, { type: 'chat:thread', payload: { id: t.id, lastMessageText: t.last_message_text || '', lastMessageAt: t.last_message_at || null, participants, unread: 0 } });
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: 'internal' }); }
});

// ── Chat image upload (Supabase Storage for persistence) ──
const chatUpload = createMulterInstance('public/uploads/chat');
r.post(
  '/chat-upload',
  ensureAuth as any,
  chatUpload.single('image'),
  uploadToSupabase('chat-attachments') as any,
  (req: any, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'no_file' });
      const url = (file as any).publicUrl || file.path || file.location || '';
      return res.json({
        url,
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
    const me = String(req.user?._id || req.user?.id || '');
    const { id } = req.params;
    const t = await findById(Tables.CHAT_THREADS, id, 'id, participants');
    if (!t || !isParticipant(t, me)) return res.status(403).json({ error: 'forbidden' });
    const others = (t.participants || []).filter((p: string) => p !== me);
    const payload = { threadId: t.id, userId: me };
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

  // Step 1: Find the mentor user (case-insensitive via Supabase ilike)
  let mentorId = '';
  try {
    const start = Date.now();
    const { data: mentor } = await db
      .from(Tables.USERS)
      .select('id, is_mentor, user_name')
      .ilike('user_name', userName)
      .limit(1)
      .maybeSingle();
    steps.push({ step: '1_find_mentor', ok: !!mentor, detail: mentor ? `id=${mentor.id}, userName=${mentor.user_name}, isMentor=${mentor.is_mentor}` : `No user found for "${userName}"`, ms: Date.now() - start });
    if (mentor) mentorId = String(mentor.id);
  } catch (err: any) {
    steps.push({ step: '1_find_mentor', ok: false, detail: err?.message || String(err) });
  }

  if (!mentorId) return res.json({ steps });

  // Step 2: Check KB documents
  try {
    const start = Date.now();
    const kbCount = await count(Tables.COACH_KNOWLEDGE, { user_id: mentorId });
    const sample = await findMany(Tables.COACH_KNOWLEDGE, { user_id: mentorId }, {
      select: 'title, classification',
      limit: 3,
    });
    steps.push({ step: '2_kb_documents', ok: kbCount > 0, detail: `${kbCount} docs. Sample: ${sample.map((d: any) => `"${d.title}" (${d.classification || 'unclassified'})`).join(', ')}`, ms: Date.now() - start });
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
