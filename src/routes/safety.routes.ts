import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, findById, updateById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";
import { sseHub } from "../lib/sseHub";
const SafetyRoutes: Router = Router();

// POST /safety/:threadId/pause — mentor pauses a conversation
SafetyRoutes.post("/:threadId/pause", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const thread = await findById(Tables.CHAT_THREADS, req.params.threadId);
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    await updateById(Tables.CHAT_THREADS, thread.id, { is_paused: true });

    await insertOne(Tables.SAFETY_FLAG_LOGS, {
      thread_id: thread.id,
      student_id: (thread.participants || []).find((p: string) => p !== user.id) || user.id,
      mentor_id: user.id,
      flag: thread.safety_status || "yellow",
      action_taken: "manual_pause",
      notes: req.body?.notes || null,
    });

    const participants = thread.participants || [];
    for (const p of participants) {
      sseHub.publish(p, {
        type: "chat:thread",
        payload: { id: thread.id, isPaused: true, safetyStatus: thread.safety_status || "yellow" },
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[safety] pause error:", err);
    return res.status(500).json({ error: "Failed to pause conversation" });
  }
});

// POST /safety/:threadId/resume — mentor resumes a conversation
SafetyRoutes.post("/:threadId/resume", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const thread = await findById(Tables.CHAT_THREADS, req.params.threadId);
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    await updateById(Tables.CHAT_THREADS, thread.id, { is_paused: false, safety_status: "green" });

    await insertOne(Tables.SAFETY_FLAG_LOGS, {
      thread_id: thread.id,
      student_id: (thread.participants || []).find((p: string) => p !== user.id) || user.id,
      mentor_id: user.id,
      flag: "green",
      action_taken: "resume",
      notes: req.body?.notes || null,
    });

    const participants = thread.participants || [];
    for (const p of participants) {
      sseHub.publish(p, {
        type: "chat:thread",
        payload: { id: thread.id, isPaused: false, safetyStatus: "green" },
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[safety] resume error:", err);
    return res.status(500).json({ error: "Failed to resume conversation" });
  }
});

// POST /safety/:threadId/override — mentor overrides a flag
const overrideSchema = z.object({
  overrideTo: z.enum(["green", "yellow"]),
  notes: z.string().max(1000).optional(),
});

SafetyRoutes.post(
  "/:threadId/override",
  Auth as any,
  validateZod({ body: overrideSchema }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

      const thread = await findById(Tables.CHAT_THREADS, req.params.threadId);
      if (!thread) return res.status(404).json({ error: "Thread not found" });

      const { overrideTo, notes } = req.body;

      await updateById(Tables.CHAT_THREADS, thread.id, {
        safety_status: overrideTo,
        is_paused: false,
      });

      await insertOne(Tables.SAFETY_FLAG_LOGS, {
        thread_id: thread.id,
        student_id: (thread.participants || []).find((p: string) => p !== user.id) || user.id,
        mentor_id: user.id,
        flag: thread.safety_status || "yellow",
        override_to: overrideTo,
        action_taken: "override",
        notes: notes || null,
      });

      const participants = thread.participants || [];
      for (const p of participants) {
        sseHub.publish(p, {
          type: "chat:thread",
          payload: { id: thread.id, isPaused: false, safetyStatus: overrideTo },
        });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[safety] override error:", err);
      return res.status(500).json({ error: "Failed to override flag" });
    }
  }
);

// GET /safety/:threadId/history — flag history for a thread
SafetyRoutes.get("/:threadId/history", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const { data: logs } = await db
      .from(Tables.SAFETY_FLAG_LOGS)
      .select("*")
      .eq("thread_id", req.params.threadId)
      .order("created_at", { ascending: false })
      .limit(100);

    return res.json({
      logs: (logs || []).map((l: any) => ({
        id: l.id,
        flag: l.flag,
        flaggedCategories: l.flagged_categories || [],
        actionTaken: l.action_taken,
        overrideTo: l.override_to,
        notes: l.notes,
        mentorId: l.mentor_id,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    console.error("[safety] history error:", err);
    return res.status(500).json({ error: "Failed to fetch safety history" });
  }
});

// GET /safety/student/:studentId/history — flag history across all threads for a student
SafetyRoutes.get("/student/:studentId/history", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const { data: logs } = await db
      .from(Tables.SAFETY_FLAG_LOGS)
      .select("*")
      .eq("student_id", req.params.studentId)
      .order("created_at", { ascending: false })
      .limit(100);

    return res.json({
      logs: (logs || []).map((l: any) => ({
        id: l.id,
        threadId: l.thread_id,
        flag: l.flag,
        flaggedCategories: l.flagged_categories || [],
        actionTaken: l.action_taken,
        overrideTo: l.override_to,
        notes: l.notes,
        mentorId: l.mentor_id,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    console.error("[safety] student history error:", err);
    return res.status(500).json({ error: "Failed to fetch safety history" });
  }
});

export default SafetyRoutes;
