import { Request, Response } from "express";
import { insertOne, findById, updateById, Tables } from "../../../../lib/db";
import { generateEmbedding } from "../../../../services/ai/embeddingService";

/**
 * POST /mentor/knowledge/confirm
 *
 * Called after the mentor reviews the AI refinement analysis.
 * Saves the document to coach_knowledge with enriched metadata.
 * If classification is "system_prompt", also appends to users.core_instructions.
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

    const sanitizedKeywords = Array.isArray(keywords)
      ? keywords.map((k: any) => String(k).trim()).filter(Boolean)
      : [];
    const sanitizedCoreRules = Array.isArray(coreRules)
      ? coreRules.map((r: any) => String(r).trim()).filter(Boolean)
      : [];
    const sanitizedEntities = Array.isArray(entities)
      ? entities.map((e: any) => String(e).trim()).filter(Boolean)
      : [];

    // Save to coach_knowledge (both system_prompt and rag get saved for list visibility)
    const doc = await insertOne(Tables.COACH_KNOWLEDGE, {
      user_id: userId,
      title: resolvedTitle,
      content: resolvedContent,
      type: fileType || "text",
      mentor_name: mentorName,
      embedding: JSON.stringify(embedding),
      summary: String(summary || "").trim() || null,
      classification: resolvedClassification,
      keywords: sanitizedKeywords,
      core_rules: sanitizedCoreRules,
      entities: sanitizedEntities,
    });

    if (!doc) {
      return res.status(500).json({ message: "failed_to_confirm_knowledge" });
    }

    // If classified as system_prompt, append to user's core instructions
    if (resolvedClassification === "system_prompt") {
      try {
        const coreRulesText =
          sanitizedCoreRules.length > 0
            ? sanitizedCoreRules.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")
            : "";

        const instructionBlock = [
          `\n\n--- ${resolvedTitle} ---`,
          summary ? `Summary: ${summary}` : "",
          coreRulesText ? `Core Principles:\n${coreRulesText}` : "",
          `Full Context:\n${resolvedContent.slice(0, 4000)}`,
        ]
          .filter(Boolean)
          .join("\n");

        const user = await findById(Tables.USERS, userId, "core_instructions");
        const existing = String((user as any)?.core_instructions || "");

        await updateById(Tables.USERS, userId, {
          core_instructions: existing + instructionBlock,
        });
      } catch (err) {
        console.error("[confirmKnowledge] Failed to update core_instructions:", err);
        // Don't fail the whole request — the knowledge doc is already saved
      }
    }

    // Remove embedding from response
    const { embedding: _emb, ...knowledge } = doc as any;

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
