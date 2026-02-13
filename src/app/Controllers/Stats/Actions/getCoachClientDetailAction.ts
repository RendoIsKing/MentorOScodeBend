import { Request, Response } from "express";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { Subscription } from "../../../Models/Subscription";
import { Types } from "mongoose";
import { UserInterface } from "../../../../types/UserInterface";
import { ChatThread } from "../../../../models/chat";
import { CoachNote } from "../../../../database/schemas/CoachNoteSchema";
import { User } from "../../../Models/User";
import { TrainingPlan, NutritionPlan, Goal } from "../../../Models/PlanModels";
import { WeightEntry } from "../../../Models/WeightEntry";
import ChangeEvent from "../../../../models/ChangeEvent";
import WorkoutLog from "../../../../models/WorkoutLog";

/**
 * GET /stats/coach-clients/:clientId
 *
 * Returns a detailed view of a single client for the authenticated coach.
 * Includes: user info, training plan, nutrition plan, weight trend,
 * recent activity, goals, notes, and chat status.
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
    if (!Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ error: "Ugyldig klient-ID." });
    }

    // 1. Verify coach-client relationship
    const coachPlans = await SubscriptionPlan.find({
      userId: coachId,
      isDeleted: false,
    }).select("_id title price planType").lean();

    if (coachPlans.length === 0) {
      return res.status(403).json({ error: "Du har ingen abonnementsplaner." });
    }

    const planIds = coachPlans.map((p) => p._id);
    const subscription = await Subscription.findOne({
      userId: new Types.ObjectId(clientId),
      planId: { $in: planIds.map((id) => new Types.ObjectId(id)) },
      status: "active",
    }).lean();

    if (!subscription) {
      return res.status(403).json({ error: "Denne brukeren er ikke din klient." });
    }

    const plan = coachPlans.find((p) => String(p._id) === String((subscription as any).planId));

    // 2. Fetch client user info (with photo)
    const client = await User.findById(clientId).select(
      "fullName userName email photoId status"
    ).lean();

    if (!client) {
      return res.status(404).json({ error: "Klient ikke funnet." });
    }

    // 2b. Resolve profile photo path
    let photoUrl: string | null = null;
    if ((client as any).photoId) {
      try {
        const File = (await import("../../../Models/File")).default;
        const file = await File.findById((client as any).photoId).select("path").lean();
        if (file) photoUrl = (file as any).path;
      } catch (err) {
        console.error("[coach-client-detail] Photo lookup failed:", err);
      }
    }

    // 3. Fetch current training plan
    const trainingPlan = await TrainingPlan.findOne({
      userId: new Types.ObjectId(clientId),
      isCurrent: true,
    }).sort({ version: -1 }).lean();

    // 4. Fetch current nutrition plan
    const nutritionPlan = await NutritionPlan.findOne({
      userId: new Types.ObjectId(clientId),
      isCurrent: true,
    }).sort({ version: -1 }).lean();

    // 5. Fetch weight trend (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const weightEntries = await WeightEntry.find({
      userId: new Types.ObjectId(clientId),
      date: { $gte: ninetyDaysAgo.toISOString().slice(0, 10) },
    }).sort({ date: 1 }).select("date kg -_id").lean();

    // 6. Fetch recent change events
    const recentChanges = await ChangeEvent.find({
      user: new Types.ObjectId(clientId),
    }).sort({ createdAt: -1 }).limit(20).lean();

    // 7. Fetch current goal
    const currentGoal = await Goal.findOne({
      userId: new Types.ObjectId(clientId),
      isCurrent: true,
    }).sort({ version: -1 }).lean();

    // 8. Fetch recent workout logs (last 14 days)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const workoutLogs = await WorkoutLog.find({
      user: new Types.ObjectId(clientId),
      date: { $gte: twoWeeksAgo.toISOString().slice(0, 10) },
    }).sort({ date: -1 }).lean();

    // 9. Fetch chat thread with this client
    const chatThread = await ChatThread.find({
      participants: { $all: [new Types.ObjectId(coachId), new Types.ObjectId(clientId)] },
    }).select("lastMessageAt lastMessageText unread safetyStatus isPaused").lean();

    const thread = chatThread[0];

    // 10. Fetch coach notes for this client
    const notes = await CoachNote.find({
      coachId: new Types.ObjectId(coachId),
      clientId: new Types.ObjectId(clientId),
    }).sort({ pinned: -1, createdAt: -1 }).limit(50).lean();

    // Build response
    const trainingSessions = (trainingPlan as any)?.sessions?.map((s: any, idx: number) => ({
      day: s.day,
      focus: s.focus || `Økt ${idx + 1}`,
      exercises: (s.exercises || []).map((e: any) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        load: e.load,
      })),
      notes: s.notes || [],
    })) || [];

    return res.status(200).json({
      client: {
        id: String((client as any)._id),
        fullName: (client as any).fullName || "Ukjent",
        userName: (client as any).userName || "",
        email: (client as any).email || "",
        status: (client as any).status || "VISITOR",
        photoUrl,
      },
      subscription: {
        plan: plan
          ? { id: String(plan._id), title: plan.title, price: plan.price, type: plan.planType }
          : null,
        subscribedAt: (subscription as any).createdAt,
      },
      training: {
        hasPlan: !!trainingPlan,
        sessions: trainingSessions,
        guidelines: (trainingPlan as any)?.guidelines || [],
        version: (trainingPlan as any)?.version,
      },
      nutrition: {
        hasPlan: !!nutritionPlan,
        dailyTargets: (nutritionPlan as any)?.dailyTargets || null,
        meals: (nutritionPlan as any)?.meals || [],
        days: (nutritionPlan as any)?.days || [],
        guidelines: (nutritionPlan as any)?.guidelines || [],
        version: (nutritionPlan as any)?.version,
      },
      weightTrend: weightEntries,
      goal: currentGoal
        ? {
            targetWeightKg: (currentGoal as any).targetWeightKg,
            strengthTargets: (currentGoal as any).strengthTargets,
            horizonWeeks: (currentGoal as any).horizonWeeks,
          }
        : null,
      recentActivity: recentChanges.map((c: any) => ({
        id: String(c._id),
        type: c.type,
        summary: c.summary,
        date: c.createdAt,
      })),
      workoutLogs: workoutLogs.map((w: any) => ({
        date: w.date,
        entries: w.entries || [],
      })),
      chat: {
        lastMessageAt: thread?.lastMessageAt || null,
        lastMessageText: thread?.lastMessageText || null,
        unreadCount: (thread as any)?.unread?.get(String(coachId)) || 0,
        safetyStatus: thread?.safetyStatus || "green",
        isPaused: thread?.isPaused || false,
      },
      notes: notes.map((n: any) => ({
        id: String(n._id),
        text: n.text,
        pinned: n.pinned,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[coach-client-detail] Error:", error);
    return res.status(500).json({ error: "Kunne ikke hente klientdetaljer." });
  }
};
