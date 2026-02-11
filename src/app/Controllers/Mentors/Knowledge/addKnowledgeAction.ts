import { Request, Response } from "express";
// Use require to avoid TS default import issues in CJS build
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
import { CoachKnowledge } from "../../../Models/CoachKnowledge";
import { generateEmbedding } from "../../../../services/ai/embeddingService";

const SUPPORTED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
};

/** Extract plain text from an uploaded file buffer based on its MIME type */
async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<{ text: string; fileType: string }> {
  // Detect by MIME or fall back to file extension
  const ext = (originalName || "").split(".").pop()?.toLowerCase() || "";
  const resolvedKind = SUPPORTED_MIME_TYPES[mimeType] || (ext === "docx" ? "docx" : ext === "pdf" ? "pdf" : ext === "doc" ? "doc" : null);

  if (!resolvedKind) {
    throw new Error(`unsupported_file_type: ${mimeType || ext}`);
  }

  if (resolvedKind === "pdf") {
    const data = await pdfParse(buffer);
    return { text: String(data?.text || "").trim(), fileType: "pdf" };
  }

  if (resolvedKind === "docx" || resolvedKind === "doc") {
    const result = await mammoth.extractRawText({ buffer });
    return { text: String(result?.value || "").trim(), fileType: "docx" };
  }

  throw new Error(`unsupported_file_type: ${resolvedKind}`);
}

export const addKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const { title, content, type } = req.body || {};
    const file = (req as any).file as Express.Multer.File | undefined;

    // For file uploads, derive title from filename if not explicitly provided
    const resolvedTitle = String(title || "").trim()
      || (file ? file.originalname.replace(/\.[^.]+$/, "") : "");
    if (!resolvedTitle) {
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
      try {
        const { text, fileType } = await extractTextFromFile(
          file.buffer,
          file.mimetype,
          file.originalname
        );
        resolvedContent = text;
        resolvedType = fileType;
      } catch (fileErr: any) {
        const msg = String(fileErr?.message || "");
        if (msg.startsWith("unsupported_file_type")) {
          return res.status(422).json({
            message: `Unsupported file type. Please upload a PDF or DOCX file.`,
          });
        }
        console.error("[addKnowledge] File parse error:", fileErr);
        return res.status(422).json({
          message: "Could not extract text from the uploaded file.",
        });
      }
    }

    if (!resolvedContent) {
      return res.status(422).json({ message: "content is required (file may be empty)" });
    }

    const embedding = await generateEmbedding(resolvedContent);
    const doc = await CoachKnowledge.create({
      userId,
      title: resolvedTitle,
      content: resolvedContent,
      type: resolvedType,
      mentorName,
      embedding,
    });

    const knowledge = doc.toObject();
    delete (knowledge as any).embedding;

    return res.json({ success: true, knowledge });
  } catch (error) {
    console.error("[addKnowledge] Unexpected error:", error);
    return res.status(500).json({ message: "failed_to_add_knowledge" });
  }
};
