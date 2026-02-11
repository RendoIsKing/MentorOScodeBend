import { Request, Response } from "express";
import { CoachKnowledge } from "../../../Models/CoachKnowledge";
import { User } from "../../../Models/User";
import { generateEmbedding } from "../../../../services/ai/embeddingService";

/**
 * PUT /mentor/knowledge/:id
 *
 * Update the analysis metadata of an existing knowledge document.
 * Allows editing title, summary, classification, keywords, coreRules, entities.
 * If classification changes to/from system_prompt, updates the mentor's coreInstructions.
 */
export const updateKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(422).json({ message: "Document ID is required." });
    }

    const doc = await CoachKnowledge.findOne({ _id: id, userId });
    if (!doc) {
      return res.status(404).json({ message: "Document not found." });
    }

    const {
      title,
      summary,
      classification,
      keywords,
      coreRules,
      entities,
    } = req.body || {};

    const oldClassification = doc.classification;

    // Update fields if provided
    if (title !== undefined) doc.title = String(title).trim();
    if (summary !== undefined) doc.summary = String(summary).trim();
    if (classification !== undefined) {
      doc.classification = classification === "system_prompt" ? "system_prompt" : "rag";
    }
    if (Array.isArray(keywords)) doc.keywords = keywords.map((k: any) => String(k).trim()).filter(Boolean);
    if (Array.isArray(coreRules)) doc.coreRules = coreRules.map((r: any) => String(r).trim()).filter(Boolean);
    if (Array.isArray(entities)) doc.entities = entities.map((e: any) => String(e).trim()).filter(Boolean);

    // Regenerate embedding if title or keywords changed (affects retrieval)
    if (title !== undefined || (Array.isArray(keywords) && keywords.length > 0)) {
      try {
        const embeddingContent = [doc.title, ...(doc.keywords || []), doc.summary || ""].filter(Boolean).join(" ");
        const embedding = await generateEmbedding(embeddingContent);
        if (embedding?.length) {
          (doc as any).embedding = embedding;
        }
      } catch (e) {
        console.error("[updateKnowledge] Failed to regenerate embedding:", e);
      }
    }

    await doc.save();

    // Handle classification changes for coreInstructions
    const newClassification = doc.classification;

    if (oldClassification !== newClassification) {
      if (newClassification === "system_prompt") {
        // Add to coreInstructions
        const instructionBlock = `\n\n--- ${doc.title} ---\n${(doc.coreRules || []).join("\n")}`;
        await User.updateOne(
          { _id: userId },
          { $set: { coreInstructions: (await User.findById(userId).select("coreInstructions").lean() as any)?.coreInstructions + instructionBlock } }
        );
      } else if (oldClassification === "system_prompt") {
        // Was system_prompt, now rag — rebuild coreInstructions from remaining system_prompt docs
        const systemDocs = await CoachKnowledge.find({
          userId,
          classification: "system_prompt",
        }).select("title coreRules").lean();

        const rebuilt = systemDocs
          .map((d: any) => `--- ${d.title} ---\n${(d.coreRules || []).join("\n")}`)
          .join("\n\n");

        await User.updateOne(
          { _id: userId },
          { $set: { coreInstructions: rebuilt } }
        );
      }
    } else if (newClassification === "system_prompt" && (coreRules !== undefined || title !== undefined)) {
      // Classification stayed system_prompt but coreRules or title changed — rebuild
      const systemDocs = await CoachKnowledge.find({
        userId,
        classification: "system_prompt",
      }).select("title coreRules").lean();

      const rebuilt = systemDocs
        .map((d: any) => `--- ${d.title} ---\n${(d.coreRules || []).join("\n")}`)
        .join("\n\n");

      await User.updateOne(
        { _id: userId },
        { $set: { coreInstructions: rebuilt } }
      );
    }

    const result = doc.toObject();
    return res.json({
      success: true,
      knowledge: {
        ...result,
        id: result._id,
      },
    });
  } catch (error: any) {
    console.error("[updateKnowledge] Unexpected error:", error);
    const detail = String(error?.message || "").slice(0, 200);
    return res.status(500).json({
      message: "failed_to_update_knowledge",
      detail: detail || undefined,
    });
  }
};
