import { Request, Response } from "express";
import { Types } from "mongoose";
import { CoachKnowledge } from "../../../Models/CoachKnowledge";
import { generateEmbedding } from "../../../../services/ai/embeddingService";

export const searchKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const { query, mentorId } = req.body || {};
    if (!query || !mentorId) {
      return res.status(422).json({ message: "query and mentorId are required" });
    }
    if (!Types.ObjectId.isValid(mentorId)) {
      return res.status(422).json({ message: "mentorId is invalid" });
    }

    const queryVector = await generateEmbedding(String(query));
    const mentorObjectId = new Types.ObjectId(mentorId);

    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: "default",
          path: "embedding",
          queryVector,
          numCandidates: 100,
          limit: 5,
          filter: { userId: { $eq: mentorObjectId } },
        },
      },
      {
        $project: {
          title: 1,
          content: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const results = await CoachKnowledge.aggregate(pipeline);

    return res.json({ success: true, results });
  } catch (error) {
    return res.status(500).json({ message: "knowledge_search_failed" });
  }
};
