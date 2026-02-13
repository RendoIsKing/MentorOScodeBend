import { Request, Response } from "express";
import { rpc } from "../../../../lib/db";
import { generateEmbedding } from "../../../../services/ai/embeddingService";

export const searchKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const { query, mentorId } = req.body || {};
    if (!query || !mentorId) {
      return res.status(422).json({ message: "query and mentorId are required" });
    }

    const queryVector = await generateEmbedding(String(query));

    const results = await rpc<Array<{ id: string; title: string; content: string; similarity: number }>>(
      "match_knowledge",
      {
        query_embedding: JSON.stringify(queryVector),
        match_user_id: mentorId,
        match_threshold: 0.7,
        match_count: 5,
      }
    );

    return res.json({ success: true, results: results || [] });
  } catch (error) {
    console.error("[searchKnowledge] Error:", error);
    return res.status(500).json({ message: "knowledge_search_failed" });
  }
};
