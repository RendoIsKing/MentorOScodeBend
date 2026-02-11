import { Request, Response } from "express";
import { CoachKnowledge } from "../../../Models/CoachKnowledge";

export const getKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const docs = await CoachKnowledge.find({ userId })
      .select("_id title content type createdAt mentorName")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: docs });
  } catch {
    return res.status(500).json({ message: "failed_to_get_knowledge" });
  }
};
