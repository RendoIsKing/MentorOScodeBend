import { Request, Response } from "express";
// Use require to avoid TS default import issues in CJS build
const pdfParse = require("pdf-parse");
import { CoachKnowledge } from "../../../Models/CoachKnowledge";
import { generateEmbedding } from "../../../../services/ai/embeddingService";

export const addKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const { title, content, type } = req.body || {};
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!title) {
      return res.status(422).json({ message: "title is required" });
    }

    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    const mentorName =
      (req as any)?.user?.name ||
      `${(req as any)?.user?.firstName || ""} ${(req as any)?.user?.lastName || ""}`.trim() ||
      undefined;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    let resolvedContent = String(content || "").trim();
    let resolvedType = type || "text";
    if (file) {
      const data = await pdfParse(file.buffer);
      resolvedContent = String(data?.text || "").trim();
      resolvedType = "pdf";
    }
    if (!resolvedContent) {
      return res.status(422).json({ message: "content is required" });
    }

    const embedding = await generateEmbedding(resolvedContent);
    const doc = await CoachKnowledge.create({
      userId,
      title,
      content: resolvedContent,
      type: resolvedType,
      mentorName,
      embedding,
    });

    const knowledge = doc.toObject();
    delete (knowledge as any).embedding;

    return res.json({ success: true, knowledge });
  } catch (error) {
    return res.status(500).json({ message: "failed_to_add_knowledge" });
  }
};
