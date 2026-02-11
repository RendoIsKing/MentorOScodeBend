import { Request, Response } from "express";
import { feedbackChat, RefinedKnowledge, FeedbackMessage } from "../../../../services/ai/refiningService";

/**
 * POST /mentor/knowledge/feedback-chat
 *
 * Conversational endpoint: the mentor gives feedback about the analysis,
 * and the AI responds in natural language to confirm understanding.
 * No re-analysis happens here — just a conversation.
 */
export const feedbackChatAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const { content, fileName, previousAnalysis, conversationHistory, message } = req.body || {};

    if (!content || !String(content).trim()) {
      return res.status(422).json({ message: "Document content is required." });
    }

    if (!message || !String(message).trim()) {
      return res.status(422).json({ message: "Message text is required." });
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

    const history: FeedbackMessage[] = Array.isArray(conversationHistory)
      ? conversationHistory.map((m: any) => ({
          role: m.role === "assistant" ? "assistant" as const : "user" as const,
          content: String(m.content || ""),
        }))
      : [];

    const aiResponse = await feedbackChat(
      String(content),
      String(fileName || "document"),
      prevAnalysis,
      history,
      String(message)
    );

    return res.json({
      success: true,
      response: aiResponse,
    });
  } catch (error: any) {
    console.error("[feedbackChat] Unexpected error:", error);
    const detail = String(error?.message || "").slice(0, 200);
    return res.status(500).json({
      message: "failed_feedback_chat",
      detail: detail || undefined,
    });
  }
};
