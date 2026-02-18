import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, findById, updateById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";
import { sseHub } from "../lib/sseHub";

const NotificationRoutes: Router = Router();

// GET /notifications — list notifications for current user
NotificationRoutes.get("/", Auth, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.perPage) || 20));
    const offset = (page - 1) * limit;

    const { count: total } = await db
      .from(Tables.NOTIFICATIONS)
      .select("id", { count: "exact", head: true })
      .contains("sent_to", [user.id])
      .eq("is_deleted", false);

    const { data: notifications } = await db
      .from(Tables.NOTIFICATIONS)
      .select("*")
      .contains("sent_to", [user.id])
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return res.json({
      data: (notifications || []).map((n: any) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        eventType: n.event_type || n.type,
        metadata: n.metadata || {},
        isRead: n.is_read || !!n.read_at,
        fromUserId: n.notification_from_user,
        createdAt: n.created_at,
      })),
      meta: { perPage: limit, page, pages: Math.ceil((total || 0) / limit), total: total || 0 },
    });
  } catch (err) {
    console.error("[notifications] GET error:", err);
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// GET /notifications/unread-count
NotificationRoutes.get("/unread-count", Auth, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    const { count } = await db
      .from(Tables.NOTIFICATIONS)
      .select("id", { count: "exact", head: true })
      .contains("sent_to", [user.id])
      .eq("is_read", false)
      .eq("is_deleted", false);

    return res.json({ unread: count || 0 });
  } catch (err) {
    console.error("[notifications] unread-count error:", err);
    return res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// POST /notifications/mark-read — mark one or all as read
const markReadSchema = z.object({
  notificationId: z.string().uuid().optional(),
  all: z.boolean().optional(),
}).strict();

NotificationRoutes.post(
  "/mark-read",
  Auth,
  validateZod({ body: markReadSchema }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      const { notificationId, all } = req.body;

      if (all) {
        await db
          .from(Tables.NOTIFICATIONS)
          .update({ is_read: true, read_at: new Date().toISOString() })
          .contains("sent_to", [user.id])
          .eq("is_read", false);
      } else if (notificationId) {
        const notif = await findById(Tables.NOTIFICATIONS, notificationId);
        if (!notif) return res.status(404).json({ error: "Not found" });
        const sentTo = notif.sent_to || [];
        if (!sentTo.includes(user.id)) return res.status(403).json({ error: "Forbidden" });
        await updateById(Tables.NOTIFICATIONS, notificationId, { is_read: true, read_at: new Date().toISOString() });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[notifications] mark-read error:", err);
      return res.status(500).json({ error: "Failed to mark as read" });
    }
  }
);

// DELETE /notifications/:id
NotificationRoutes.delete("/:id", Auth, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    const notif = await findById(Tables.NOTIFICATIONS, req.params.id);
    if (!notif) return res.status(404).json({ error: "Not found" });
    const sentTo = notif.sent_to || [];
    if (!sentTo.includes(user.id)) return res.status(403).json({ error: "Forbidden" });

    await updateById(Tables.NOTIFICATIONS, req.params.id, { is_deleted: true, deleted_at: new Date().toISOString() });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[notifications] delete error:", err);
    return res.status(500).json({ error: "Failed to delete notification" });
  }
});

// POST /notifications/push-subscribe — save browser push subscription
const pushSubSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
}).strict();

NotificationRoutes.post(
  "/push-subscribe",
  Auth,
  validateZod({ body: pushSubSchema }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      const { endpoint, keys } = req.body;

      await db
        .from(Tables.PUSH_SUBSCRIPTIONS)
        .upsert({ user_id: user.id, endpoint, keys }, { onConflict: "user_id,endpoint" });

      return res.json({ ok: true });
    } catch (err) {
      console.error("[notifications] push-subscribe error:", err);
      return res.status(500).json({ error: "Failed to save push subscription" });
    }
  }
);

export default NotificationRoutes;

// Helper to create a notification (used by other services)
export async function createNotification(params: {
  title: string;
  description: string;
  sentTo: string[];
  eventType: string;
  metadata?: Record<string, any>;
  fromUserId?: string;
}) {
  try {
    const notif = await insertOne(Tables.NOTIFICATIONS, {
      title: params.title,
      description: params.description,
      sent_to: params.sentTo,
      event_type: params.eventType,
      metadata: params.metadata || {},
      notification_from_user: params.fromUserId || null,
      is_read: false,
    });

    if (notif) {
      for (const userId of params.sentTo) {
        sseHub.publish(userId, {
          type: "notification",
          payload: {
            id: notif.id,
            title: params.title,
            description: params.description,
            eventType: params.eventType,
            metadata: params.metadata || {},
            createdAt: notif.created_at,
          },
        });
      }
    }

    return notif;
  } catch (err) {
    console.error("[createNotification] Error:", err);
    return null;
  }
}
