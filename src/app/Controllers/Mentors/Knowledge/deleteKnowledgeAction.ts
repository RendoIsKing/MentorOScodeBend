import { Request, Response } from "express";
import { Types } from "mongoose";
import { CoachKnowledge } from "../../../Models/CoachKnowledge";

export const deleteKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const { id } = req.params || {};
    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(422).json({ message: "invalid id" });
    }

    await CoachKnowledge.deleteOne({ _id: id, userId });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: "failed_to_delete_knowledge" });
  }
};
