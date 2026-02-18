import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, findById, updateById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";

const CoachNotesRoutes: Router = Router();

const noteBodySchema = z.object({
  text: z.string().trim().min(1).max(5000),
  category: z.string().max(100).optional(),
  pinned: z.boolean().optional(),
});

// GET /coach-notes/:clientId
CoachNotesRoutes.get(
  "/:clientId",
  Auth as any,
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const { data: notes } = await db
        .from(Tables.COACH_NOTES)
        .select("*")
        .eq("coach_id", coachId)
        .eq("client_id", clientId)
        .eq("is_deleted", false)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      return res.json({
        notes: (notes || []).map((n: any) => ({
          id: n.id,
          text: n.text,
          category: n.category || "general",
          pinned: n.pinned,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
        })),
      });
    } catch (err) {
      console.error("[coach-notes] list error:", err);
      return res.status(500).json({ message: "Kunne ikke hente notater." });
    }
  }
);

// POST /coach-notes/:clientId
CoachNotesRoutes.post(
  "/:clientId",
  Auth as any,
  validateZod({ body: noteBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      const { text, category, pinned } = req.body;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const note = await insertOne(Tables.COACH_NOTES, {
        coach_id: coachId,
        client_id: clientId,
        text,
        category: category || "general",
        pinned: pinned ?? false,
      });

      if (!note) return res.status(500).json({ message: "Kunne ikke opprette notat." });

      return res.status(201).json({
        note: {
          id: note.id,
          text: note.text,
          category: note.category,
          pinned: note.pinned,
          createdAt: note.created_at,
          updatedAt: note.updated_at,
        },
      });
    } catch (err) {
      console.error("[coach-notes] create error:", err);
      return res.status(500).json({ message: "Kunne ikke opprette notat." });
    }
  }
);

// PUT /coach-notes/note/:noteId
CoachNotesRoutes.put(
  "/note/:noteId",
  Auth as any,
  validateZod({ body: noteBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { noteId } = req.params;
      const { text, category, pinned } = req.body;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const existing = await findById(Tables.COACH_NOTES, noteId);
      if (!existing || existing.coach_id !== coachId) {
        return res.status(404).json({ message: "Notat ikke funnet." });
      }

      const updates: any = { text };
      if (category !== undefined) updates.category = category;
      if (pinned !== undefined) updates.pinned = pinned;

      const note = await updateById(Tables.COACH_NOTES, noteId, updates);
      if (!note) return res.status(500).json({ message: "Kunne ikke oppdatere notat." });

      return res.json({
        note: {
          id: note.id,
          text: note.text,
          category: note.category,
          pinned: note.pinned,
          createdAt: note.created_at,
          updatedAt: note.updated_at,
        },
      });
    } catch (err) {
      console.error("[coach-notes] update error:", err);
      return res.status(500).json({ message: "Kunne ikke oppdatere notat." });
    }
  }
);

// DELETE /coach-notes/note/:noteId
CoachNotesRoutes.delete(
  "/note/:noteId",
  Auth as any,
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { noteId } = req.params;
      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const existing = await findById(Tables.COACH_NOTES, noteId);
      if (!existing || existing.coach_id !== coachId) {
        return res.status(404).json({ message: "Notat ikke funnet." });
      }

      await updateById(Tables.COACH_NOTES, noteId, { is_deleted: true, deleted_at: new Date().toISOString() });
      return res.json({ ok: true });
    } catch (err) {
      console.error("[coach-notes] delete error:", err);
      return res.status(500).json({ message: "Kunne ikke slette notat." });
    }
  }
);

export default CoachNotesRoutes;
