import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";
import { UserInterface } from "../../../../types/UserInterface";

/**
 * GET /stats/coach-clients/:clientId
 *
 * Returns a detailed view of a single client for the authenticated coach.
 * Fully Supabase-based (no Mongoose).
 */
export const getCoachClientDetail = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const reqUser = req.user as UserInterface;
    const coachId = reqUser?.id;
    const { clientId } = req.params;

    if (!coachId) return res.status(401).json({ error: "Unauthorized" });
    if (!reqUser.isMentor) return res.status(403).json({ error: "Mentor access required" });
    if (!clientId) return res.status(400).json({ error: "Missing clientId" });

    // 1. Verify coach-client relationship
    const { data: coachPlans } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("id, title, price, plan_type")
      .eq("user_id", coachId)
      .eq("is_deleted", false);

    if (!coachPlans || coachPlans.length === 0) {
      return res.status(403).json({ error: "Du har ingen abonnementsplaner." });
    }

    const planIds = coachPlans.map((p: any) => p.id);

    const { data: subscription } = await db
      .from(Tables.SUBSCRIPTIONS)
      .select("id, plan_id, created_at")
      .eq("user_id", clientId)
      .in("plan_id", planIds)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return res.status(403).json({ error: "Denne brukeren er ikke din klient." });
    }

    const plan = coachPlans.find((p: any) => p.id === subscription.plan_id);

    // 2. Fetch client user info
    const { data: client } = await db
      .from(Tables.USERS)
      .select("id, full_name, user_name, email, photo_id")
      .eq("id", clientId)
      .maybeSingle();

    if (!client) {
      return res.status(404).json({ error: "Klient ikke funnet." });
    }

    // 2b. Resolve photo
    let photoUrl: string | null = null;
    if (client.photo_id) {
      const { data: file } = await db
        .from(Tables.FILES)
        .select("path")
        .eq("id", client.photo_id)
        .maybeSingle();
      if (file) photoUrl = file.path;
    }

    // 3. Fetch current training plan
    const { data: trainingPlan } = await db
      .from(Tables.TRAINING_PLANS)
      .select("*")
      .eq("user_id", clientId)
      .eq("is_current", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Fetch current nutrition plan
    const { data: nutritionPlan } = await db
      .from(Tables.NUTRITION_PLANS)
      .select("*")
      .eq("user_id", clientId)
      .eq("is_current", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 5. Fetch weight trend (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data: weightEntries } = await db
      .from(Tables.WEIGHT_ENTRIES)
      .select("date, kg")
      .eq("user_id", clientId)
      .gte("date", ninetyDaysAgo.toISOString().slice(0, 10))
      .order("date", { ascending: true });

    // 6. Fetch recent change events
    const { data: recentChanges } = await db
      .from(Tables.CHANGE_EVENTS)
      .select("id, type, summary, created_at")
      .eq("user_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20);

    // 7. Fetch current goal
    const { data: currentGoal } = await db
      .from(Tables.GOALS)
      .select("*")
      .eq("user_id", clientId)
      .eq("is_current", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 8. Fetch recent workout logs (last 14 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const { data: workoutLogs } = await db
      .from(Tables.WORKOUT_LOGS)
      .select("date, entries")
      .eq("user_id", clientId)
      .gte("date", twoWeeksAgo.toISOString().slice(0, 10))
      .order("date", { ascending: false });

    // 9. Fetch chat thread with this client
    const { data: threads } = await db
      .from(Tables.CHAT_THREADS)
      .select("last_message_at, last_message_text, unread, safety_status, is_paused")
      .contains("participants", [coachId, clientId]);

    const thread = threads?.[0];

    // Build training sessions from plan
    const trainingSessions = (trainingPlan?.sessions || []).map((s: any, idx: number) => ({
      day: s.day,
      focus: s.focus || `Økt ${idx + 1}`,
      exercises: (s.exercises || []).map((e: any) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        load: e.load,
      })),
      notes: s.notes || [],
    }));

    return res.status(200).json({
      client: {
        id: client.id,
        fullName: client.full_name || "Ukjent",
        userName: client.user_name || "",
        email: client.email || "",
        photoUrl,
      },
      subscription: {
        plan: plan
          ? { id: plan.id, title: plan.title, price: plan.price, type: plan.plan_type }
          : null,
        subscribedAt: subscription.created_at,
      },
      training: {
        hasPlan: !!trainingPlan,
        sessions: trainingSessions,
        guidelines: trainingPlan?.guidelines || [],
        version: trainingPlan?.version,
      },
      nutrition: {
        hasPlan: !!nutritionPlan,
        dailyTargets: nutritionPlan?.daily_targets || null,
        meals: nutritionPlan?.meals || [],
        days: nutritionPlan?.days || [],
        guidelines: nutritionPlan?.guidelines || [],
        version: nutritionPlan?.version,
      },
      weightTrend: (weightEntries || []).map((w: any) => ({ date: w.date, kg: w.kg })),
      goal: currentGoal
        ? {
            targetWeightKg: currentGoal.target_weight_kg,
            strengthTargets: currentGoal.strength_targets,
            horizonWeeks: currentGoal.horizon_weeks,
          }
        : null,
      recentActivity: (recentChanges || []).map((c: any) => ({
        id: c.id,
        type: c.type,
        summary: c.summary,
        date: c.created_at,
      })),
      workoutLogs: (workoutLogs || []).map((w: any) => ({
        date: w.date,
        entries: w.entries || [],
      })),
      chat: {
        lastMessageAt: thread?.last_message_at || null,
        lastMessageText: thread?.last_message_text || null,
        unreadCount: thread?.unread?.[coachId] || 0,
        safetyStatus: thread?.safety_status || "green",
        isPaused: thread?.is_paused || false,
      },
      notes: [],
    });
  } catch (error) {
    console.error("[coach-client-detail] Error:", error);
    return res.status(500).json({ error: "Kunne ikke hente klientdetaljer." });
  }
};
