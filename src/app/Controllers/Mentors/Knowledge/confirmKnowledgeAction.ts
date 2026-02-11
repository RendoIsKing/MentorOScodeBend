import { Request, Response } from "express";
import { CoachKnowledge } from "../../../Models/CoachKnowledge";
import { User } from "../../../Models/User";
import { generateEmbedding } from "../../../../services/ai/embeddingService";

/**
 * POST /mentor/knowledge/confirm
 *
 * Called after the mentor reviews the AI refinement analysis.
 * Saves the document to CoachKnowledge with enriched metadata.
 * If classification is "system_prompt", also appends to User.coreInstructions.
 */
export const confirmKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    const mentorName =
      (req as any)?.user?.name ||
      `${(req as any)?.user?.firstName || ""} ${(req as any)?.user?.lastName || ""}`.trim() ||
      undefined;

    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const {
      title,
      content,
      summary,
      classification,
      keywords,
      coreRules,
      entities,
      fileType,
    } = req.body || {};

    // Validate required fields
    const resolvedTitle = String(title || "").trim();
    if (!resolvedTitle) {
      return res.status(422).json({ message: "title is required" });
    }

    const resolvedContent = String(content || "").trim();
    if (!resolvedContent) {
      return res.status(422).json({ message: "content is required" });
    }

    const resolvedClassification =
      classification === "system_prompt" ? "system_prompt" : "rag";

    // Generate embedding for RAG retrieval
    const embedding = await generateEmbedding(resolvedContent);

    // Save to CoachKnowledge (both system_prompt and rag get saved for list visibility)
    const doc = await CoachKnowledge.create({
      userId,
      title: resolvedTitle,
      content: resolvedContent,
      type: fileType || "text",
      mentorName,
      embedding,
      summary: String(summary || "").trim() || null,
      classification: resolvedClassification,
      keywords: Array.isArray(keywords)
        ? keywords.map((k: any) => String(k).trim()).filter(Boolean)
        : [],
      coreRules: Array.isArray(coreRules)
        ? coreRules.map((r: any) => String(r).trim()).filter(Boolean)
        : [],
      entities: Array.isArray(entities)
        ? entities.map((e: any) => String(e).trim()).filter(Boolean)
        : [],
    });

    // If classified as system_prompt, append to user's core instructions
    if (resolvedClassification === "system_prompt") {
      try {
        const coreRulesText = Array.isArray(coreRules) && coreRules.length > 0
          ? coreRules.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")
          : "";

        const instructionBlock = [
          `\n\n--- ${resolvedTitle} ---`,
          summary ? `Summary: ${summary}` : "",
          coreRulesText ? `Core Principles:\n${coreRulesText}` : "",
          `Full Context:\n${resolvedContent.slice(0, 4000)}`,
        ]
          .filter(Boolean)
          .join("\n");

        await User.findByIdAndUpdate(userId, {
          $set: {
            coreInstructions: await (async () => {
              const user = await User.findById(userId).select("coreInstructions").lean();
              const existing = String((user as any)?.coreInstructions || "");
              return existing + instructionBlock;
            })(),
          },
        });
      } catch (err) {
        console.error("[confirmKnowledge] Failed to update coreInstructions:", err);
        // Don't fail the whole request — the knowledge doc is already saved
      }
    }

    const knowledge = doc.toObject();
    delete (knowledge as any).embedding;

    return res.json({ success: true, knowledge });
  } catch (error: any) {
    console.error("[confirmKnowledge] Unexpected error:", error);
    const detail = String(error?.message || "").slice(0, 200);
    return res.status(500).json({
      message: "failed_to_confirm_knowledge",
      detail: detail || undefined,
    });
  }
};
