import { Router, Request, Response } from "express";
import Auth from "../app/Middlewares/auth";
import { UserInterface } from "../types/UserInterface";
import { sseHub } from "../lib/sseHub";
import { db } from "../lib/db";

const CallRoutes = Router();
const ensureAuth = Auth;

/**
 * POST /call/initiate — Start a call to another user
 *
 * Body: { targetUserId: string, conversationId?: string }
 * Sends a call:incoming event via Supabase Realtime to the target user.
 * Logs the call in the database.
 */
CallRoutes.post(
  "/initiate",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const caller = req.user as UserInterface;
      const callerId = caller?.id;
      const { targetUserId, conversationId, isVideo } = req.body;

      if (!callerId) return res.status(401).json({ message: "Unauthorized" });
      if (!targetUserId) return res.status(400).json({ message: "targetUserId required" });
      if (targetUserId === callerId) return res.status(400).json({ message: "Cannot call yourself" });

      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const callerName = caller.fullName || caller.userName || "Ukjent";

      // Log call in database
      try {
        await db.from("call_logs").insert({
          id: callId,
          caller_id: callerId,
          receiver_id: targetUserId,
          conversation_id: conversationId || null,
          status: "ringing",
          started_at: new Date().toISOString(),
          is_video: Boolean(isVideo),
          caller_name: callerName,
        });
      } catch (err) {
        console.error("[call] Failed to log call:", err);
        // Non-fatal — continue even if logging fails
      }

      // Send call:incoming event to target user
      await sseHub.publish(targetUserId, {
        type: "call:incoming",
        payload: {
          callId,
          callerId,
          callerName,
          callerPhoto: null, // Could resolve photo here
          conversationId,
          isVideo: Boolean(isVideo),
        },
      });

      return res.json({
        callId,
        status: "ringing",
      });
    } catch (err) {
      console.error("[call] Failed to initiate call:", err);
      return res.status(500).json({ message: "Kunne ikke starte samtale." });
    }
  }
);

/**
 * POST /call/signal — Relay WebRTC signaling data
 *
 * Body: { callId: string, targetUserId: string, type: "offer"|"answer"|"ice-candidate", data: any }
 */
CallRoutes.post(
  "/signal",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const senderId = (req.user as UserInterface)?.id;
      const { callId, targetUserId, type, data } = req.body;

      if (!senderId) return res.status(401).json({ message: "Unauthorized" });
      if (!callId || !targetUserId || !type || !data) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const validTypes = ["offer", "answer", "ice-candidate"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid signal type" });
      }

      // Relay the signal to the target user
      await sseHub.publish(targetUserId, {
        type: `call:${type}`,
        payload: {
          callId,
          senderId,
          data,
        },
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("[call] Failed to relay signal:", err);
      return res.status(500).json({ message: "Signaleringsfeil." });
    }
  }
);

/**
 * POST /call/answer — Accept an incoming call
 *
 * Body: { callId: string, callerId: string }
 */
CallRoutes.post(
  "/answer",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const receiverId = (req.user as UserInterface)?.id;
      const { callId, callerId } = req.body;

      if (!receiverId) return res.status(401).json({ message: "Unauthorized" });
      if (!callId || !callerId) return res.status(400).json({ message: "Missing fields" });

      // Update call status
      try {
        await db
          .from("call_logs")
          .update({ status: "active", answered_at: new Date().toISOString() })
          .eq("id", callId);
      } catch (err) {
        console.error("[call] Failed to update call status:", err);
      }

      // Notify caller that call was answered
      await sseHub.publish(callerId, {
        type: "call:answered",
        payload: { callId, receiverId },
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("[call] Failed to answer call:", err);
      return res.status(500).json({ message: "Feil ved svar på samtale." });
    }
  }
);

/**
 * POST /call/reject — Reject or decline an incoming call
 *
 * Body: { callId: string, callerId: string, reason?: string }
 */
CallRoutes.post(
  "/reject",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const receiverId = (req.user as UserInterface)?.id;
      const { callId, callerId, reason } = req.body;

      if (!receiverId) return res.status(401).json({ message: "Unauthorized" });
      if (!callId || !callerId) return res.status(400).json({ message: "Missing fields" });

      // Update call status
      try {
        await db
          .from("call_logs")
          .update({ status: reason === "busy" ? "busy" : "rejected", ended_at: new Date().toISOString() })
          .eq("id", callId);
      } catch (err) {
        console.error("[call] Failed to update call status:", err);
      }

      // Notify caller
      await sseHub.publish(callerId, {
        type: "call:rejected",
        payload: { callId, reason: reason || "declined" },
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("[call] Failed to reject call:", err);
      return res.status(500).json({ message: "Feil." });
    }
  }
);

/**
 * POST /call/end — End an active call
 *
 * Body: { callId: string, targetUserId: string }
 */
CallRoutes.post(
  "/end",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as UserInterface)?.id;
      const { callId, targetUserId } = req.body;

      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      if (!callId || !targetUserId) return res.status(400).json({ message: "Missing fields" });

      // Update call status
      try {
        await db
          .from("call_logs")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", callId);
      } catch (err) {
        console.error("[call] Failed to update call end:", err);
      }

      // Notify the other user
      await sseHub.publish(targetUserId, {
        type: "call:ended",
        payload: { callId, endedBy: userId },
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error("[call] Failed to end call:", err);
      return res.status(500).json({ message: "Feil." });
    }
  }
);

/**
 * GET /call/history?userId=xxx — Get call history with a specific user
 */
CallRoutes.get(
  "/history",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as UserInterface)?.id;
      const { withUserId, limit: rawLimit } = req.query;

      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const limit = Math.min(50, parseInt(rawLimit as string) || 20);

      let query = db
        .from("call_logs")
        .select("*")
        .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (withUserId) {
        query = query.or(
          `and(caller_id.eq.${userId},receiver_id.eq.${withUserId}),and(caller_id.eq.${withUserId},receiver_id.eq.${userId})`
        );
      }

      const { data: calls, error } = await query;

      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          console.warn("[call] call_logs table does not exist yet — returning empty list");
          return res.json({ calls: [] });
        }
        console.error("[call] Failed to fetch history:", error);
        return res.status(500).json({ message: "Kunne ikke hente samtalelogg." });
      }

      return res.json({
        calls: (calls || []).map((c: any) => ({
          id: c.id,
          callerId: c.caller_id,
          receiverId: c.receiver_id,
          conversationId: c.conversation_id,
          status: c.status,
          startedAt: c.started_at,
          answeredAt: c.answered_at,
          endedAt: c.ended_at,
          duration: c.answered_at && c.ended_at
            ? Math.round((new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) / 1000)
            : 0,
        })),
      });
    } catch (err) {
      console.error("[call] Failed to fetch history:", err);
      return res.json({ calls: [] });
    }
  }
);

/**
 * GET /call/missed — Get unseen missed/rejected/busy calls for the current user
 */
CallRoutes.get(
  "/missed",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as UserInterface)?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { data: calls, error } = await db
        .from("call_logs")
        .select("*")
        .eq("receiver_id", userId)
        .eq("seen_by_receiver", false)
        .in("status", ["rejected", "missed", "busy"])
        .order("started_at", { ascending: false })
        .limit(50);

      if (error) {
        // If the table doesn't exist yet, return empty list instead of crashing
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          console.warn("[call] call_logs table does not exist yet — returning empty list");
          return res.json({ missedCalls: [], count: 0 });
        }
        console.error("[call] Failed to fetch missed calls:", error);
        return res.status(500).json({ message: "Kunne ikke hente tapte anrop." });
      }

      return res.json({
        missedCalls: (calls || []).map((c: any) => ({
          id: c.id,
          callerId: c.caller_id,
          callerName: c.caller_name || "Ukjent",
          isVideo: Boolean(c.is_video),
          status: c.status,
          startedAt: c.started_at,
          conversationId: c.conversation_id,
        })),
        count: (calls || []).length,
      });
    } catch (err) {
      console.error("[call] Failed to fetch missed calls:", err);
      return res.json({ missedCalls: [], count: 0 });
    }
  }
);

/**
 * POST /call/mark-seen — Mark missed calls as seen
 *
 * Body: { callIds?: string[] } — if omitted, marks ALL unseen calls as seen
 */
CallRoutes.post(
  "/mark-seen",
  ensureAuth as any,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as UserInterface)?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { callIds } = req.body;

      let query = db
        .from("call_logs")
        .update({ seen_by_receiver: true })
        .eq("receiver_id", userId)
        .eq("seen_by_receiver", false);

      if (Array.isArray(callIds) && callIds.length > 0) {
        query = query.in("id", callIds);
      }

      const { error } = await query;

      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) {
          console.warn("[call] call_logs table does not exist yet — skipping mark-seen");
          return res.json({ ok: true });
        }
        console.error("[call] Failed to mark calls as seen:", error);
        return res.status(500).json({ message: "Feil." });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[call] Failed to mark calls as seen:", err);
      return res.json({ ok: true });
    }
  }
);

export default CallRoutes;
