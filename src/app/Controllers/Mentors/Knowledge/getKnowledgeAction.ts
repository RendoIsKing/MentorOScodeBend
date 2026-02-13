import { Request, Response } from "express";
import { findMany, Tables } from "../../../../lib/db";

export const getKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const docs = await findMany(Tables.COACH_KNOWLEDGE, { user_id: userId }, {
      select: "id, title, content, type, created_at, mentor_name, summary, classification, keywords, core_rules, entities",
      orderBy: "created_at",
      ascending: false,
    });

    return res.json({ success: true, data: docs });
  } catch {
    return res.status(500).json({ message: "failed_to_get_knowledge" });
  }
};
