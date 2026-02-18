import { Router, Request, Response } from "express";
import { Auth } from "../app/Middlewares";
import { db, Tables } from "../lib/db";
import { UserInterface } from "../types/UserInterface";

const MentorAnalyticsRoutes: Router = Router();

// GET /mentor-analytics/overview — retention, engagement, revenue trend, per-plan stats
MentorAnalyticsRoutes.get("/overview", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const mentorId = user.id;

    // Get mentor's plans
    const { data: plans } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("id, title, price, plan_type, trial_days, tier_order, billing_interval")
      .eq("user_id", mentorId)
      .eq("is_deleted", false);
    const planIds = (plans || []).map((p: any) => p.id);

    if (planIds.length === 0) {
      return res.json({
        retention: { current: 0, previous: 0 },
        engagement: { average: 0, activeCount: 0, totalCount: 0 },
        revenueTrend: [],
        planStats: [],
      });
    }

    // Get all subscriptions
    const { data: allSubs } = await db
      .from(Tables.SUBSCRIPTIONS)
      .select("id, user_id, plan_id, status, start_date, end_date, created_at")
      .in("plan_id", planIds);

    const subs = allSubs || [];
    const activeSubs = subs.filter((s: any) => s.status === "active" || s.status === "ACTIVE");
    const now = new Date();

    // Retention: % of subscribers active > 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const currentRetention = activeSubs.length > 0
      ? Math.round((activeSubs.filter((s: any) => new Date(s.created_at) < thirtyDaysAgo).length / Math.max(1, subs.filter((s: any) => new Date(s.created_at) < thirtyDaysAgo).length)) * 100)
      : 0;

    const previousRetention = activeSubs.length > 0
      ? Math.round((subs.filter((s: any) => s.status === "active" && new Date(s.created_at) < sixtyDaysAgo).length / Math.max(1, subs.filter((s: any) => new Date(s.created_at) < sixtyDaysAgo).length)) * 100)
      : 0;

    // Engagement: students with messages in last 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const activeUserIds = activeSubs.map((s: any) => s.user_id);

    let activeMessageUsers = 0;
    if (activeUserIds.length > 0) {
      const { data: threads } = await db
        .from(Tables.CHAT_THREADS)
        .select("participants, last_message_at")
        .gte("last_message_at", sevenDaysAgo.toISOString());

      const activeStudentSet = new Set<string>();
      for (const t of (threads || [])) {
        for (const p of (t.participants || [])) {
          if (activeUserIds.includes(p)) activeStudentSet.add(p);
        }
      }
      activeMessageUsers = activeStudentSet.size;
    }

    const avgEngagement = activeUserIds.length > 0
      ? Math.round((activeMessageUsers / activeUserIds.length) * 100)
      : 0;

    // Revenue trend: last 6 months
    const revenueTrend: { month: string; gross: number; net: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthStart = d.toISOString();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: txns } = await db
        .from(Tables.TRANSACTIONS)
        .select("amount")
        .in("product_id", planIds)
        .eq("status", "COMPLETED")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);

      const gross = (txns || []).reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
      revenueTrend.push({
        month: monthKey,
        gross: Math.round(gross * 100),
        net: Math.round(gross * 85),
        count: (txns || []).length,
      });
    }

    // Per-plan stats
    const planStats = (plans || []).map((plan: any) => {
      const planSubs = subs.filter((s: any) => s.plan_id === plan.id);
      const planActive = planSubs.filter((s: any) => s.status === "active" || s.status === "ACTIVE");
      return {
        id: plan.id,
        title: plan.title,
        price: plan.price,
        activeSubscribers: planActive.length,
        totalSubscribers: planSubs.length,
        trialDays: plan.trial_days || 0,
        tierOrder: plan.tier_order || 1,
      };
    });

    return res.json({
      retention: { current: currentRetention, previous: previousRetention },
      engagement: { average: avgEngagement, activeCount: activeMessageUsers, totalCount: activeUserIds.length },
      revenueTrend,
      planStats,
    });
  } catch (err) {
    console.error("[mentor-analytics] overview error:", err);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// GET /mentor-analytics/student/:studentId — per-student progress data
MentorAnalyticsRoutes.get("/student/:studentId", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const { studentId } = req.params;
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Weight trend
    const { data: weights } = await db
      .from(Tables.WEIGHT_ENTRIES)
      .select("date, kg")
      .eq("user_id", studentId)
      .gte("date", ninetyDaysAgo)
      .order("date", { ascending: true });

    // Workout frequency (workouts per week over 12 weeks)
    const { data: workouts } = await db
      .from(Tables.WORKOUT_LOGS)
      .select("date")
      .eq("user_id", studentId)
      .gte("date", ninetyDaysAgo)
      .order("date", { ascending: true });

    const workoutsByWeek: Record<string, number> = {};
    for (const w of (workouts || [])) {
      const d = new Date(w.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      workoutsByWeek[weekKey] = (workoutsByWeek[weekKey] || 0) + 1;
    }

    const workoutFrequency = Object.entries(workoutsByWeek).map(([week, count]) => ({ week, count }));

    // Chat engagement (messages per week)
    const { data: threads } = await db
      .from(Tables.CHAT_THREADS)
      .select("id")
      .contains("participants", [studentId]);

    let messagesByWeek: Record<string, number> = {};
    if (threads && threads.length > 0) {
      const threadIds = threads.map((t: any) => t.id);
      const { data: messages } = await db
        .from(Tables.CHAT_MESSAGES)
        .select("created_at")
        .in("thread_id", threadIds)
        .eq("sender", studentId)
        .gte("created_at", new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString());

      for (const m of (messages || [])) {
        const d = new Date(m.created_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const weekKey = weekStart.toISOString().slice(0, 10);
        messagesByWeek[weekKey] = (messagesByWeek[weekKey] || 0) + 1;
      }
    }

    const chatEngagement = Object.entries(messagesByWeek).map(([week, count]) => ({ week, count }));

    // Plan completion: workouts logged vs planned sessions per week
    const { data: currentPlan } = await db
      .from(Tables.TRAINING_PLANS)
      .select("sessions")
      .eq("user_id", studentId)
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();

    const plannedPerWeek = currentPlan?.sessions ? (currentPlan.sessions as any[]).length : 0;
    const totalWorkouts = (workouts || []).length;
    const weeksTracked = Math.max(1, Object.keys(workoutsByWeek).length);
    const avgWorkoutsPerWeek = totalWorkouts / weeksTracked;
    const planCompletion = plannedPerWeek > 0 ? Math.min(100, Math.round((avgWorkoutsPerWeek / plannedPerWeek) * 100)) : 0;

    return res.json({
      weightTrend: weights || [],
      workoutFrequency,
      chatEngagement,
      planCompletion,
      plannedPerWeek,
      avgWorkoutsPerWeek: Math.round(avgWorkoutsPerWeek * 10) / 10,
    });
  } catch (err) {
    console.error("[mentor-analytics] student error:", err);
    return res.status(500).json({ error: "Failed to fetch student analytics" });
  }
});

export default MentorAnalyticsRoutes;
