// Use require to avoid TS default import issues in CJS build
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const SUPPORTED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
};

/** Extract plain text from an uploaded file buffer based on its MIME type */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<{ text: string; fileType: string }> {
  // Detect by MIME or fall back to file extension
  const ext = (originalName || "").split(".").pop()?.toLowerCase() || "";
  const resolvedKind =
    SUPPORTED_MIME_TYPES[mimeType] ||
    (ext === "docx" ? "docx" : ext === "pdf" ? "pdf" : ext === "doc" ? "doc" : ext === "txt" ? "txt" : null);

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

  if (resolvedKind === "txt") {
    return { text: buffer.toString("utf-8").trim(), fileType: "txt" };
  }

  throw new Error(`unsupported_file_type: ${resolvedKind}`);
}
