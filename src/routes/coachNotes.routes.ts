import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { CoachNote } from "../database/schemas/CoachNoteSchema";
import { Types } from "mongoose";
import { UserInterface } from "../types/UserInterface";
import { objectIdParam } from "../app/Validation/requestSchemas";

const CoachNotesRoutes: Router = Router();

const noteBodySchema = z.object({
  text: z.string().trim().min(1).max(5000),
  pinned: z.boolean().optional(),
});

// GET /coach-notes/:clientId — List notes for a client
CoachNotesRoutes.get(
  "/:clientId",
  Auth as any,
  validateZod({ params: objectIdParam("clientId") }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;

      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const notes = await CoachNote.find({
        coachId: new Types.ObjectId(coachId),
        clientId: new Types.ObjectId(clientId),
      })
        .sort({ pinned: -1, createdAt: -1 })
        .limit(100)
        .lean();

      return res.json({
        notes: notes.map((n: any) => ({
          id: String(n._id),
          text: n.text,
          pinned: n.pinned,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        })),
      });
    } catch (err) {
      console.error("[coach-notes] Failed to list notes:", err);
      return res.status(500).json({ message: "Kunne ikke hente notater." });
    }
  }
);

// POST /coach-notes/:clientId — Create a note
CoachNotesRoutes.post(
  "/:clientId",
  Auth as any,
  validateZod({ params: objectIdParam("clientId"), body: noteBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { clientId } = req.params;
      const { text, pinned } = req.body;

      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const note = await CoachNote.create({
        coachId: new Types.ObjectId(coachId),
        clientId: new Types.ObjectId(clientId),
        text,
        pinned: pinned ?? false,
      });

      return res.status(201).json({
        note: {
          id: String(note._id),
          text: note.text,
          pinned: note.pinned,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        },
      });
    } catch (err) {
      console.error("[coach-notes] Failed to create note:", err);
      return res.status(500).json({ message: "Kunne ikke opprette notat." });
    }
  }
);

// PUT /coach-notes/note/:noteId — Update a note
CoachNotesRoutes.put(
  "/note/:noteId",
  Auth as any,
  validateZod({ params: objectIdParam("noteId"), body: noteBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { noteId } = req.params;
      const { text, pinned } = req.body;

      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const note = await CoachNote.findOneAndUpdate(
        { _id: new Types.ObjectId(noteId), coachId: new Types.ObjectId(coachId) },
        { $set: { text, ...(pinned !== undefined ? { pinned } : {}) } },
        { new: true }
      ).lean();

      if (!note) return res.status(404).json({ message: "Notat ikke funnet." });

      return res.json({
        note: {
          id: String((note as any)._id),
          text: (note as any).text,
          pinned: (note as any).pinned,
          createdAt: (note as any).createdAt,
          updatedAt: (note as any).updatedAt,
        },
      });
    } catch (err) {
      console.error("[coach-notes] Failed to update note:", err);
      return res.status(500).json({ message: "Kunne ikke oppdatere notat." });
    }
  }
);

// DELETE /coach-notes/note/:noteId — Delete a note
CoachNotesRoutes.delete(
  "/note/:noteId",
  Auth as any,
  validateZod({ params: objectIdParam("noteId") }),
  async (req: Request, res: Response) => {
    try {
      const coachId = (req.user as UserInterface)?.id;
      const { noteId } = req.params;

      if (!coachId) return res.status(401).json({ message: "Unauthorized" });

      const result = await CoachNote.deleteOne({
        _id: new Types.ObjectId(noteId),
        coachId: new Types.ObjectId(coachId),
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "Notat ikke funnet." });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[coach-notes] Failed to delete note:", err);
      return res.status(500).json({ message: "Kunne ikke slette notat." });
    }
  }
);

export default CoachNotesRoutes;
