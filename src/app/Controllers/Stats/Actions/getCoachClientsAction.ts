import { Request, Response } from "express";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { Subscription } from "../../../Models/Subscription";
import { Types } from "mongoose";
import { ChatThread } from "../../../../models/chat";
import { UserInterface } from "../../../../types/UserInterface";

/**
 * GET /stats/coach-clients
 *
 * Returns enriched client list for the authenticated coach/mentor.
 * Each client includes: basic info, subscription tier, last message,
 * unread count, and safety status from the chat thread.
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
    const plans = await SubscriptionPlan.find({
      userId: coachId,
      isDeleted: false,
    }).select("_id title price planType").lean();

    if (plans.length === 0) {
      return res.status(200).json({ clients: [] });
    }

    const planIds = plans.map((p) => p._id);
    const planMap = new Map(plans.map((p) => [String(p._id), p]));

    // 2. Aggregate subscribers with user info and subscription details
    const subscribers = await Subscription.aggregate([
      {
        $match: {
          planId: { $in: planIds.map((id) => new Types.ObjectId(id)) },
          status: "active",
        },
      },
      // Get the most recent subscription per user
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          subscriptionDoc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$subscriptionDoc" } },
      // Join user details
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      // Join photo
      {
        $lookup: {
          from: "files",
          localField: "user.photoId",
          foreignField: "_id",
          as: "photo",
        },
      },
      {
        $project: {
          clientId: "$userId",
          fullName: "$user.fullName",
          userName: "$user.userName",
          email: "$user.email",
          photoUrl: { $arrayElemAt: ["$photo.path", 0] },
          planId: 1,
          subscriptionStatus: "$status",
          subscribedAt: "$createdAt",
        },
      },
    ]);

    // 3. For each subscriber, fetch their chat thread with the coach
    const coachObjectId = new Types.ObjectId(coachId);
    const clientIds = subscribers.map((s) => s.clientId);

    const threads = await ChatThread.find({
      participants: {
        $all: [coachObjectId],
        $elemMatch: { $in: clientIds },
      },
    })
      .select("participants lastMessageAt lastMessageText unread safetyStatus isPaused")
      .lean();

    // Map threads by client ID
    const threadByClient = new Map<string, any>();
    for (const thread of threads) {
      const clientParticipant = thread.participants.find(
        (p: Types.ObjectId) => String(p) !== String(coachId)
      );
      if (clientParticipant) {
        threadByClient.set(String(clientParticipant), thread);
      }
    }

    // 4. Build enriched client list
    const clients = subscribers.map((sub) => {
      const thread = threadByClient.get(String(sub.clientId));
      const plan = planMap.get(String(sub.planId));

      return {
        id: String(sub.clientId),
        fullName: sub.fullName || "Ukjent",
        userName: sub.userName || "",
        email: sub.email || "",
        photoUrl: sub.photoUrl || null,
        // Subscription info
        plan: plan
          ? { id: String(plan._id), title: plan.title, price: plan.price, type: plan.planType }
          : null,
        subscribedAt: sub.subscribedAt,
        // Chat info
        lastMessageAt: thread?.lastMessageAt || null,
        lastMessageText: thread?.lastMessageText || null,
        unreadCount: thread?.unread?.get(String(coachId)) || 0,
        safetyStatus: thread?.safetyStatus || "green",
        isPaused: thread?.isPaused || false,
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
