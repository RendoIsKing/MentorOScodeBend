import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, findById, updateById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";
import crypto from "crypto";

const InviteLinkRoutes: Router = Router();

// GET /invite-links — list mentor's invite links
InviteLinkRoutes.get("/", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const { data: links } = await db
      .from(Tables.INVITE_LINKS)
      .select("*")
      .eq("mentor_id", user.id)
      .order("created_at", { ascending: false });

    return res.json({
      links: (links || []).map((l: any) => ({
        id: l.id,
        code: l.code,
        planId: l.plan_id,
        clicks: l.clicks,
        isActive: l.is_active,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    console.error("[invite-links] list error:", err);
    return res.status(500).json({ error: "Failed to fetch invite links" });
  }
});

// POST /invite-links — create new invite link
const createBody = z.object({
  planId: z.string().uuid().optional(),
});

InviteLinkRoutes.post(
  "/",
  Auth as any,
  validateZod({ body: createBody }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

      const code = crypto.randomBytes(6).toString("hex");

      const link = await insertOne(Tables.INVITE_LINKS, {
        mentor_id: user.id,
        code,
        plan_id: req.body.planId || null,
      });

      if (!link) return res.status(500).json({ error: "Failed to create invite link" });

      return res.status(201).json({
        link: { id: link.id, code: link.code, planId: link.plan_id, clicks: 0, isActive: true },
      });
    } catch (err) {
      console.error("[invite-links] create error:", err);
      return res.status(500).json({ error: "Failed to create invite link" });
    }
  }
);

// GET /invite-links/resolve/:code — public: resolve an invite link (no auth)
InviteLinkRoutes.get("/resolve/:code", async (req: Request, res: Response) => {
  try {
    const { data: link } = await db
      .from(Tables.INVITE_LINKS)
      .select("*, mentor:users!invite_links_mentor_id_fkey(id, user_name, full_name, bio)")
      .eq("code", req.params.code)
      .eq("is_active", true)
      .maybeSingle();

    if (!link) return res.status(404).json({ error: "Invalid or expired invite link" });

    // Increment clicks
    await db
      .from(Tables.INVITE_LINKS)
      .update({ clicks: (link.clicks || 0) + 1 })
      .eq("id", link.id);

    return res.json({
      mentorId: link.mentor_id,
      mentorUserName: link.mentor?.user_name,
      mentorName: link.mentor?.full_name,
      mentorBio: link.mentor?.bio,
      planId: link.plan_id,
    });
  } catch (err) {
    console.error("[invite-links] resolve error:", err);
    return res.status(500).json({ error: "Failed to resolve invite link" });
  }
});

// DELETE /invite-links/:id — deactivate
InviteLinkRoutes.delete("/:id", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    const link = await findById(Tables.INVITE_LINKS, req.params.id);
    if (!link || link.mentor_id !== user.id) return res.status(404).json({ error: "Not found" });

    await updateById(Tables.INVITE_LINKS, link.id, { is_active: false });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[invite-links] delete error:", err);
    return res.status(500).json({ error: "Failed to delete invite link" });
  }
});

export default InviteLinkRoutes;
