import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, findById, updateById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";
import { createNotification } from "./notification.routes";

const GoalSuggestionsRoutes: Router = Router();

const suggestBody = z.object({
  targetWeightKg: z.number().min(20).max(500).optional(),
  strengthTargets: z.string().max(500).optional(),
  horizonWeeks: z.number().int().min(1).max(260).optional(),
  message: z.string().max(1000).optional(),
});

// POST /goal-suggestions/:studentId — mentor creates a suggestion
GoalSuggestionsRoutes.post(
  "/:studentId",
  Auth as any,
  validateZod({ body: suggestBody }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

      const { studentId } = req.params;
      const { targetWeightKg, strengthTargets, horizonWeeks, message } = req.body;

      const suggestion = await insertOne(Tables.GOAL_SUGGESTIONS, {
        mentor_id: user.id,
        student_id: studentId,
        target_weight_kg: targetWeightKg,
        strength_targets: strengthTargets,
        horizon_weeks: horizonWeeks,
        message: message || null,
        status: "pending",
      });

      if (!suggestion) return res.status(500).json({ error: "Failed to create suggestion" });

      await createNotification({
        title: "Nytt målforslag fra mentor",
        description: message || "Mentoren din har foreslått et nytt mål for deg.",
        sentTo: [studentId],
        eventType: "goal_suggestion",
        metadata: { suggestionId: suggestion.id },
        fromUserId: user.id,
      });

      return res.status(201).json({ suggestion });
    } catch (err) {
      console.error("[goal-suggestions] create error:", err);
      return res.status(500).json({ error: "Failed to create goal suggestion" });
    }
  }
);

// GET /goal-suggestions/pending — student sees their pending suggestions
GoalSuggestionsRoutes.get("/pending", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;

    const { data: suggestions } = await db
      .from(Tables.GOAL_SUGGESTIONS)
      .select("*")
      .eq("student_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    return res.json({ suggestions: suggestions || [] });
  } catch (err) {
    console.error("[goal-suggestions] pending list error:", err);
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

// GET /goal-suggestions/mentor/:studentId — mentor sees suggestions they sent
GoalSuggestionsRoutes.get("/mentor/:studentId", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const { data: suggestions } = await db
      .from(Tables.GOAL_SUGGESTIONS)
      .select("*")
      .eq("mentor_id", user.id)
      .eq("student_id", req.params.studentId)
      .order("created_at", { ascending: false })
      .limit(20);

    return res.json({ suggestions: suggestions || [] });
  } catch (err) {
    console.error("[goal-suggestions] mentor list error:", err);
    return res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

// POST /goal-suggestions/:suggestionId/respond — student accepts or rejects
const respondBody = z.object({
  accept: z.boolean(),
});

GoalSuggestionsRoutes.post(
  "/:suggestionId/respond",
  Auth as any,
  validateZod({ body: respondBody }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      const suggestion = await findById(Tables.GOAL_SUGGESTIONS, req.params.suggestionId);

      if (!suggestion || suggestion.student_id !== user.id) {
        return res.status(404).json({ error: "Suggestion not found" });
      }

      const newStatus = req.body.accept ? "accepted" : "rejected";

      await updateById(Tables.GOAL_SUGGESTIONS, suggestion.id, {
        status: newStatus,
        responded_at: new Date().toISOString(),
      });

      if (req.body.accept) {
        const { data: latest } = await db
          .from(Tables.GOALS)
          .select("version")
          .eq("user_id", user.id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextVersion = ((latest as any)?.version || 0) + 1;

        await db.from(Tables.GOALS).update({ is_current: false }).eq("user_id", user.id).eq("is_current", true);

        await insertOne(Tables.GOALS, {
          user_id: user.id,
          version: nextVersion,
          is_current: true,
          target_weight_kg: suggestion.target_weight_kg,
          strength_targets: suggestion.strength_targets,
          horizon_weeks: suggestion.horizon_weeks,
        });
      }

      await createNotification({
        title: newStatus === "accepted" ? "Målforslag akseptert" : "Målforslag avvist",
        description: `Studenten har ${newStatus === "accepted" ? "akseptert" : "avvist"} målforslaget ditt.`,
        sentTo: [suggestion.mentor_id],
        eventType: "goal_suggestion_response",
        metadata: { suggestionId: suggestion.id, status: newStatus },
        fromUserId: user.id,
      });

      return res.json({ ok: true, status: newStatus });
    } catch (err) {
      console.error("[goal-suggestions] respond error:", err);
      return res.status(500).json({ error: "Failed to respond to suggestion" });
    }
  }
);

export default GoalSuggestionsRoutes;
