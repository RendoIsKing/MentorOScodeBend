import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";
import { UserInterface } from "../../../../types/UserInterface";

/**
 * GET /stats/coach-clients
 *
 * Returns enriched client list for the authenticated coach/mentor.
 * Each client includes: basic info, subscription tier, last message,
 * unread count, and safety status from the chat thread.
 *
 * Fully Supabase-based (no Mongoose).
 */
export const getCoachClients = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const reqUser = req.user as UserInterface;
    const coachId = reqUser?.id;

    if (!coachId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 1. Find all subscription plans owned by this coach
    const { data: plans, error: plansErr } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("id, title, price, plan_type")
      .eq("user_id", coachId)
      .eq("is_deleted", false);

    if (plansErr) {
      console.error("[coach-clients] plans query error:", plansErr);
      return res.status(500).json({ error: "Kunne ikke hente planer." });
    }

    if (!plans || plans.length === 0) {
      return res.status(200).json({
        clients: [],
        summary: { total: 0, withUnread: 0, paused: 0 },
      });
    }

    const planIds = plans.map((p: any) => p.id);
    const planMap = new Map(plans.map((p: any) => [p.id, p]));

    // 2. Get active subscriptions for those plans (handle both ACTIVE and active)
    const { data: subscriptions, error: subsErr } = await db
      .from(Tables.SUBSCRIPTIONS)
      .select("id, user_id, plan_id, status, created_at")
      .in("plan_id", planIds)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (subsErr) {
      console.error("[coach-clients] subscriptions query error:", subsErr);
      return res.status(500).json({ error: "Kunne ikke hente abonnementer." });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({
        clients: [],
        summary: { total: 0, withUnread: 0, paused: 0 },
      });
    }

    // Deduplicate: keep only the most recent subscription per user
    const seenUsers = new Set<string>();
    const uniqueSubs: any[] = [];
    for (const sub of subscriptions) {
      if (!seenUsers.has(sub.user_id)) {
        seenUsers.add(sub.user_id);
        uniqueSubs.push(sub);
      }
    }

    const subscriberIds = uniqueSubs.map((s) => s.user_id);

    // 3. Get user details with photos
    const { data: users, error: usersErr } = await db
      .from(Tables.USERS)
      .select("id, full_name, user_name, email, photo_id")
      .in("id", subscriberIds);

    if (usersErr) {
      console.error("[coach-clients] users query error:", usersErr);
    }

    // Resolve photo URLs
    const photoIds = (users || []).map((u: any) => u.photo_id).filter(Boolean);
    let photoMap = new Map<string, string>();
    if (photoIds.length > 0) {
      const { data: files } = await db
        .from(Tables.FILES)
        .select("id, path")
        .in("id", photoIds);
      if (files) {
        photoMap = new Map(files.map((f: any) => [f.id, f.path]));
      }
    }

    const userMap = new Map(
      (users || []).map((u: any) => [
        u.id,
        {
          ...u,
          photoUrl: u.photo_id ? photoMap.get(u.photo_id) || null : null,
        },
      ])
    );

    // 4. Get chat threads where the coach is a participant
    // Supabase array containment: participants @> ARRAY[coachId]::uuid[]
    const { data: threads, error: threadsErr } = await db
      .from(Tables.CHAT_THREADS)
      .select("id, participants, last_message_at, last_message_text, unread, safety_status, is_paused")
      .contains("participants", [coachId]);

    if (threadsErr) {
      console.error("[coach-clients] threads query error:", threadsErr);
    }

    // Map threads by the other participant (client) ID
    const threadByClient = new Map<string, any>();
    for (const thread of threads || []) {
      const participants: string[] = thread.participants || [];
      const clientParticipant = participants.find((p) => p !== coachId);
      if (clientParticipant && subscriberIds.includes(clientParticipant)) {
        threadByClient.set(clientParticipant, thread);
      }
    }

    // 5. Build enriched client list
    const clients = uniqueSubs.map((sub) => {
      const user = userMap.get(sub.user_id);
      const thread = threadByClient.get(sub.user_id);
      const plan = planMap.get(sub.plan_id);

      const unreadObj = thread?.unread || {};
      const unreadCount = Number(unreadObj[coachId] || 0);

      return {
        id: sub.user_id,
        fullName: user?.full_name || "Ukjent",
        userName: user?.user_name || "",
        email: user?.email || "",
        photoUrl: user?.photoUrl || null,
        plan: plan
          ? { id: plan.id, title: plan.title, price: plan.price, type: plan.plan_type }
          : null,
        subscribedAt: sub.created_at,
        lastMessageAt: thread?.last_message_at || null,
        lastMessageText: thread?.last_message_text || null,
        unreadCount,
        safetyStatus: thread?.safety_status || "green",
        isPaused: thread?.is_paused || false,
        threadId: thread?.id || null,
      };
    });

    // Sort: unread first, then by last message date
    clients.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return dateB - dateA;
    });

    return res.status(200).json({
      clients,
      summary: {
        total: clients.length,
        withUnread: clients.filter((c) => c.unreadCount > 0).length,
        paused: clients.filter((c) => c.isPaused).length,
      },
    });
  } catch (error) {
    console.error("[coach-clients] Error fetching clients:", error);
    return res.status(500).json({ error: "Kunne ikke hente klientliste." });
  }
};
