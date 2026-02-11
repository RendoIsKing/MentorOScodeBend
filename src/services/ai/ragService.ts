import mongoose from "mongoose";
import { CoachKnowledge } from "../../app/Models/CoachKnowledge";
import { generateEmbedding } from "./embeddingService";

export type RetrievedDoc = {
  title: string;
  content: string;
  snippet: string;
};

function toSnippet(text: string, max = 220) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned;
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function retrieveContext(query: string, mentorId: string): Promise<RetrievedDoc[]> {
  const cleaned = String(query || "").trim();
  if (!cleaned) return [];

  if (!mongoose.Types.ObjectId.isValid(mentorId)) {
    try { console.log(`⚠️ Invalid mentorId for RAG: ${mentorId}`); } catch {}
    return [];
  }
  const userObjectId = new mongoose.Types.ObjectId(mentorId);
  try {
    console.log(`🔍 RAG Lookup started for mentorId: ${mentorId} with query: ${cleaned}`);
  } catch {}
  let vectorResults: Array<{ title?: string; content?: string }> = [];
  try {
    const queryVector = await generateEmbedding(cleaned);
    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: "default",
          path: "embedding",
          queryVector,
          numCandidates: 80,
          limit: 3,
          filter: { userId: { $eq: userObjectId } },
        },
      },
      { $project: { content: 1, title: 1, score: { $meta: "vectorSearchScore" } } },
    ];
    vectorResults = await CoachKnowledge.aggregate(pipeline);
    try { console.log(`🧩 Vector Search found ${vectorResults.length} results.`); } catch {}
  } catch {
    vectorResults = [];
  }

  // Keyword-boosted search: match against stored keywords array from Smart Ingestion Pipeline
  let keywordResults: Array<{ title?: string; content?: string }> = [];
  try {
    const queryTokens = cleaned
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((w) => w && w.length > 1);

    if (queryTokens.length) {
      const keywordOrClauses = queryTokens.map((word) => ({
        keywords: { $regex: escapeRegex(word), $options: "i" },
      }));
      keywordResults = (await CoachKnowledge.find({
        userId: userObjectId,
        $or: keywordOrClauses,
      })
        .limit(3)
        .lean()) as any;
      try { console.log(`🏷️ Keyword Tag Search found ${keywordResults.length} results.`); } catch {}
    }
  } catch {
    keywordResults = [];
  }

  // Text/fallback search on content field
  let textResults: Array<{ title?: string; content?: string }> = [];
  try {
    const stopWords = new Set([
      "hva",
      "er",
      "den",
      "det",
      "de",
      "som",
      "jeg",
      "du",
      "vi",
      "i",
      "på",
      "til",
      "av",
      "og",
      "eller",
      "a",
      "an",
      "the",
      "is",
      "are",
      "was",
      "were",
      "what",
    ]);
    const keywords = cleaned
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((w) => w && !stopWords.has(w) && w.length > 1);

    if (keywords.length) {
      const orClauses = keywords.map((word) => ({
        content: { $regex: escapeRegex(word), $options: "i" },
      }));
      textResults = (await CoachKnowledge.find({
        userId: userObjectId,
        $or: orClauses,
      })
        .limit(3)
        .lean()) as any;
    } else {
      textResults = [];
    }
    try { console.log(`📝 Text/Fallback Search found ${textResults.length} results.`); } catch {}
  } catch {
    textResults = [];
  }

  // Combine all sources: keyword matches get priority (appear first)
  const combined = [...keywordResults, ...vectorResults, ...textResults];
  const seen = new Set<string>();
  const docs: RetrievedDoc[] = [];
  for (const item of combined) {
    const title = String(item?.title || "Untitled").trim() || "Untitled";
    const content = String(item?.content || "").trim();
    if (!content) continue;
    const key = `${title}::${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({ title, content, snippet: toSnippet(content) });
  }
  try {
    const combinedPreview = docs.map((d) => d.content).join("\n\n");
    const preview = combinedPreview.slice(0, 100);
    console.log(`✅ Final Combined Context: ${preview}`);
  } catch {}
  return docs;
}
