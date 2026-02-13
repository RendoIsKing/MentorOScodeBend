import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";

export const deleteKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const { id } = req.params || {};
    if (!id) {
      return res.status(422).json({ message: "invalid id" });
    }

    const { error } = await db
      .from(Tables.COACH_KNOWLEDGE)
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[deleteKnowledge] Supabase error:", error.message);
      return res.status(500).json({ message: "failed_to_delete_knowledge" });
    }

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: "failed_to_delete_knowledge" });
  }
};
