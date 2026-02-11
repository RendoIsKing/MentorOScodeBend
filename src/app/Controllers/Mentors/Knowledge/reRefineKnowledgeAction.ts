import { Request, Response } from "express";
import { reRefineDocument, RefinedKnowledge } from "../../../../services/ai/refiningService";

/**
 * POST /mentor/knowledge/re-refine
 *
 * Called when the mentor provides feedback on the initial AI analysis.
 * Accepts JSON with the document content, previous analysis, and feedback.
 * Returns an updated analysis incorporating the mentor's corrections.
 */
export const reRefineKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const { content, fileName, previousAnalysis, feedback } = req.body || {};

    if (!content || !String(content).trim()) {
      return res.status(422).json({ message: "Document content is required." });
    }

    if (!feedback || !String(feedback).trim()) {
      return res.status(422).json({ message: "Feedback text is required." });
    }

    if (!previousAnalysis) {
      return res.status(422).json({ message: "Previous analysis is required." });
    }

    const prevAnalysis: RefinedKnowledge = {
      summary: String(previousAnalysis.summary || ""),
      classification: previousAnalysis.classification === "system_prompt" ? "system_prompt" : "rag",
      keywords: Array.isArray(previousAnalysis.keywords) ? previousAnalysis.keywords : [],
      coreRules: Array.isArray(previousAnalysis.coreRules) ? previousAnalysis.coreRules : [],
      entities: Array.isArray(previousAnalysis.entities) ? previousAnalysis.entities : [],
      suggestedTitle: String(previousAnalysis.suggestedTitle || ""),
    };

    const updatedAnalysis = await reRefineDocument(
      String(content),
      String(fileName || "document"),
      prevAnalysis,
      String(feedback)
    );

    return res.json({
      success: true,
      analysis: updatedAnalysis,
    });
  } catch (error: any) {
    console.error("[reRefineKnowledge] Unexpected error:", error);
    const detail = String(error?.message || "").slice(0, 200);
    return res.status(500).json({
      message: "failed_to_re_refine_knowledge",
      detail: detail || undefined,
    });
  }
};
