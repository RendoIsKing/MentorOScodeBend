import { Request, Response } from "express";
import { extractTextFromFile } from "../../../../utils/fileTextExtractor";
import { refineDocument } from "../../../../services/ai/refiningService";

/**
 * POST /mentor/knowledge/refine
 *
 * Accepts a file upload (multipart), extracts text, runs it through the
 * GPT-4o-mini Refining Agent, and returns the analysis WITHOUT saving.
 * The mentor reviews the analysis on the frontend and then confirms.
 */
export const refineKnowledgeAction = async (req: Request, res: Response) => {
  try {
    const userId = (req as any)?.user?._id || (req as any)?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(422).json({ message: "A file is required for refinement." });
    }

    // Step 1: Extract text from file
    let extractedText: string;
    let fileType: string;
    try {
      const result = await extractTextFromFile(
        file.buffer,
        file.mimetype,
        file.originalname
      );
      extractedText = result.text;
      fileType = result.fileType;
    } catch (fileErr: any) {
      const msg = String(fileErr?.message || "");
      if (msg.startsWith("unsupported_file_type")) {
        return res.status(422).json({
          message: "Unsupported file type. Please upload a PDF, DOCX, or TXT file.",
        });
      }
      console.error("[refineKnowledge] File parse error:", fileErr);
      return res.status(422).json({
        message: "Could not extract text from the uploaded file.",
      });
    }

    if (!extractedText.trim()) {
      return res.status(422).json({
        message: "The uploaded file appears to be empty.",
      });
    }

    // Step 2: Run through the Refining Agent
    const analysis = await refineDocument(extractedText, file.originalname);

    // Return the raw content + AI analysis for frontend review
    return res.json({
      success: true,
      fileName: file.originalname,
      fileType,
      content: extractedText,
      analysis,
    });
  } catch (error: any) {
    console.error("[refineKnowledge] Unexpected error:", error);
    const detail = String(error?.message || "").slice(0, 200);
    return res.status(500).json({
      message: "failed_to_refine_knowledge",
      detail: detail || undefined,
    });
  }
};
