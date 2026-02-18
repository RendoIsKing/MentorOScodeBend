import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, findById, deleteById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";

const StudentTagsRoutes: Router = Router();

const tagBody = z.object({
  label: z.string().trim().min(1).max(50),
  color: z.string().max(20).optional(),
});

// GET /student-tags — all tags the mentor has created (across all students)
StudentTagsRoutes.get("/", Auth as any, async (req: Request, res: Response) => {
  try {
    const coachId = (req.user as UserInterface)?.id;
    if (!coachId) return res.status(401).json({ error: "Unauthorized" });

    const { data: tags } = await db
      .from(Tables.STUDENT_TAGS)
      .select("*")
      .eq("coach_id", coachId)
      .order("label", { ascending: true });

    return res.json({ tags: tags || [] });
  } catch (err) {
    console.error("[student-tags] list error:", err);
    return res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// GET /student-tags/:clientId — tags for a specific student
StudentTagsRoutes.get("/:clientId", Auth as any, async (req: Request, res: Response) => {
  try {
    const coachId = (req.user as UserInterface)?.id;
    if (!coachId) return res.status(401).json({ error: "Unauthorized" });

    const { data: tags } = await db
      .from(Tables.STUDENT_TAGS)
      .select("*")
      .eq("coach_id", coachId)
      .eq("client_id", req.params.clientId)
      .order("created_at", { ascending: false });

    return res.json({ tags: tags || [] });
  } catch (err) {
    console.error("[student-tags] list by client error:", err);
    return res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// POST /student-tags/:clientId — add tag to student
StudentTagsRoutes.post(
  "/:clientId",
  Auth as any,
  validateZod({ body: tagBody }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      if (!coachId) return res.status(401).json({ error: "Unauthorized" });

      const { clientId } = req.params;
      const { label, color } = req.body;

      const tag = await insertOne(Tables.STUDENT_TAGS, {
        coach_id: coachId,
        client_id: clientId,
        label,
        color: color || "#6B7280",
      });

      if (!tag) return res.status(409).json({ error: "Tag already exists for this student" });
      return res.status(201).json({ tag });
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Tag already exists" });
      console.error("[student-tags] create error:", err);
      return res.status(500).json({ error: "Failed to create tag" });
    }
  }
);

// DELETE /student-tags/:tagId
StudentTagsRoutes.delete("/:tagId", Auth as any, async (req: Request, res: Response) => {
  try {
    const coachId = (req.user as UserInterface)?.id;
    if (!coachId) return res.status(401).json({ error: "Unauthorized" });

    const tag = await findById(Tables.STUDENT_TAGS, req.params.tagId);
    if (!tag || tag.coach_id !== coachId) return res.status(404).json({ error: "Tag not found" });

    await deleteById(Tables.STUDENT_TAGS, req.params.tagId);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[student-tags] delete error:", err);
    return res.status(500).json({ error: "Failed to delete tag" });
  }
});

export default StudentTagsRoutes;
