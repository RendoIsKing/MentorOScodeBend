import { Request, Response } from "express";
import { db, findOne, findById, updateById, findMany, Tables } from "../../../../lib/db";
import { generateEmbedding } from "../../../../services/ai/embeddingService";

/**
 * PUT /mentor/knowledge/:id
 *
 * Update the analysis metadata of an existing knowledge document.
 * Allows editing title, summary, classification, keywords, coreRules, entities.
 * If classification changes to/from system_prompt, updates the mentor's core_instructions.
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

    // Find the existing document (owned by this user)
    const doc = await findOne<any>(Tables.COACH_KNOWLEDGE, { id, user_id: userId });
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

    // Build update payload — only include provided fields
    const updates: Record<string, any> = {};

    if (title !== undefined) updates.title = String(title).trim();
    if (summary !== undefined) updates.summary = String(summary).trim();
    if (classification !== undefined) {
      updates.classification = classification === "system_prompt" ? "system_prompt" : "rag";
    }
    if (Array.isArray(keywords)) {
      updates.keywords = keywords.map((k: any) => String(k).trim()).filter(Boolean);
    }
    if (Array.isArray(coreRules)) {
      updates.core_rules = coreRules.map((r: any) => String(r).trim()).filter(Boolean);
    }
    if (Array.isArray(entities)) {
      updates.entities = entities.map((e: any) => String(e).trim()).filter(Boolean);
    }

    // Regenerate embedding if title or keywords changed (affects retrieval)
    if (title !== undefined || (Array.isArray(keywords) && keywords.length > 0)) {
      try {
        const embeddingContent = [
          updates.title || doc.title,
          ...(updates.keywords || doc.keywords || []),
          updates.summary || doc.summary || "",
        ]
          .filter(Boolean)
          .join(" ");
        const embedding = await generateEmbedding(embeddingContent);
        if (embedding?.length) {
          updates.embedding = JSON.stringify(embedding);
        }
      } catch (e) {
        console.error("[updateKnowledge] Failed to regenerate embedding:", e);
      }
    }

    // Persist updates
    const updated = await updateById<any>(Tables.COACH_KNOWLEDGE, id, updates);
    if (!updated) {
      return res.status(500).json({ message: "failed_to_update_knowledge" });
    }

    // Handle classification changes for core_instructions
    const newClassification = updates.classification ?? oldClassification;

    if (oldClassification !== newClassification) {
      if (newClassification === "system_prompt") {
        // Add to core_instructions
        const rules = updates.core_rules || doc.core_rules || [];
        const instructionBlock = `\n\n--- ${updated.title} ---\n${rules.join("\n")}`;
        const user = await findById<any>(Tables.USERS, userId, "core_instructions");
        const existing = String(user?.core_instructions || "");
        await updateById(Tables.USERS, userId, {
          core_instructions: existing + instructionBlock,
        });
      } else if (oldClassification === "system_prompt") {
        // Was system_prompt, now rag — rebuild core_instructions from remaining system_prompt docs
        await rebuildCoreInstructions(userId);
      }
    } else if (
      newClassification === "system_prompt" &&
      (coreRules !== undefined || title !== undefined)
    ) {
      // Classification stayed system_prompt but coreRules or title changed — rebuild
      await rebuildCoreInstructions(userId);
    }

    // Remove embedding from response
    const { embedding: _emb, ...knowledge } = updated;

    return res.json({
      success: true,
      knowledge: {
        ...knowledge,
        id: knowledge.id,
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

/**
 * Rebuild the user's core_instructions from all system_prompt classified knowledge docs.
 */
async function rebuildCoreInstructions(userId: string) {
  try {
    const systemDocs = await findMany<any>(
      Tables.COACH_KNOWLEDGE,
      { user_id: userId, classification: "system_prompt" },
      { select: "title, core_rules" }
    );

    const rebuilt = systemDocs
      .map((d: any) => `--- ${d.title} ---\n${(d.core_rules || []).join("\n")}`)
      .join("\n\n");

    await updateById(Tables.USERS, userId, { core_instructions: rebuilt });
  } catch (err) {
    console.error("[updateKnowledge] Failed to rebuild core_instructions:", err);
  }
}
