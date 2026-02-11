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

// Comprehensive stop words for Norwegian + English to reduce noise in search queries
const STOP_WORDS = new Set([
  // Norwegian
  "hva", "er", "den", "det", "de", "som", "jeg", "du", "vi", "han", "hun",
  "i", "på", "til", "av", "og", "eller", "men", "at", "en", "et", "ei",
  "for", "med", "om", "ut", "inn", "har", "var", "ble", "kan", "vil",
  "skal", "meg", "deg", "seg", "oss", "min", "din", "sin", "mitt", "ditt",
  "dette", "disse", "noe", "noen", "her", "der", "da", "når", "hvor",
  "fra", "etter", "under", "over", "mot", "ved", "bare", "også", "så",
  "jo", "vel", "nok", "vet", "helt", "ikke", "nei", "ja", "før", "litt",
  "ganske", "veldig", "alle", "mye", "mange", "nå",
  // English
  "a", "an", "the", "is", "are", "was", "were", "what", "how", "do",
  "does", "did", "can", "could", "will", "would", "should", "have", "has",
  "had", "be", "been", "am", "it", "its", "my", "your", "his", "her",
  "our", "they", "them", "this", "that", "these", "those", "if", "but",
  "or", "and", "not", "no", "yes", "so", "too", "very", "just", "about",
  "with", "from", "into", "of", "on", "at", "by", "to", "for", "as",
  "up", "out", "in",
]);

/**
 * Extract meaningful search tokens from a query string.
 * Removes stop words and short words to focus on content-bearing terms.
 */
function extractSearchTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w && !STOP_WORDS.has(w) && w.length > 2);
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

  const searchTokens = extractSearchTokens(cleaned);
  try { console.log(`🔑 Search tokens: [${searchTokens.join(", ")}]`); } catch {}

  // --- Strategy 1: Vector (semantic) search ---
  // Increased numCandidates and limit to catch more semantically relevant documents
  let vectorResults: Array<{ title?: string; content?: string; score?: number }> = [];
  try {
    const queryVector = await generateEmbedding(cleaned);
    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: "default",
          path: "embedding",
          queryVector,
          numCandidates: 200,
          limit: 6,
          filter: { userId: { $eq: userObjectId } },
        },
      },
      { $project: { content: 1, title: 1, score: { $meta: "vectorSearchScore" } } },
    ];
    vectorResults = await CoachKnowledge.aggregate(pipeline);
    try {
      console.log(`🧩 Vector Search found ${vectorResults.length} results:`,
        vectorResults.map((r) => `"${r.title}" (score: ${(r.score ?? 0).toFixed(3)})`).join(", "));
    } catch {}
  } catch (err) {
    try { console.error("Vector search failed:", err); } catch {}
    vectorResults = [];
  }

  // --- Strategy 2: Keyword tag search (Smart Ingestion Pipeline keywords) ---
  let keywordResults: Array<{ title?: string; content?: string }> = [];
  try {
    if (searchTokens.length) {
      const keywordOrClauses = searchTokens.map((word) => ({
        keywords: { $regex: escapeRegex(word), $options: "i" },
      }));
      keywordResults = (await CoachKnowledge.find({
        userId: userObjectId,
        $or: keywordOrClauses,
      })
        .limit(5)
        .lean()) as any;
      try { console.log(`🏷️ Keyword Tag Search found ${keywordResults.length} results.`); } catch {}
    }
  } catch {
    keywordResults = [];
  }

  // --- Strategy 3: Title search (match document titles) ---
  let titleResults: Array<{ title?: string; content?: string }> = [];
  try {
    if (searchTokens.length) {
      const titleOrClauses = searchTokens.map((word) => ({
        title: { $regex: escapeRegex(word), $options: "i" },
      }));
      titleResults = (await CoachKnowledge.find({
        userId: userObjectId,
        $or: titleOrClauses,
      })
        .limit(4)
        .lean()) as any;
      try { console.log(`📄 Title Search found ${titleResults.length} results.`); } catch {}
    }
  } catch {
    titleResults = [];
  }

  // --- Strategy 4: Content text search (fallback regex on content) ---
  let textResults: Array<{ title?: string; content?: string }> = [];
  try {
    if (searchTokens.length) {
      const orClauses = searchTokens.map((word) => ({
        content: { $regex: escapeRegex(word), $options: "i" },
      }));
      textResults = (await CoachKnowledge.find({
        userId: userObjectId,
        $or: orClauses,
      })
        .limit(5)
        .lean()) as any;
    } else {
      textResults = [];
    }
    try { console.log(`📝 Text/Fallback Search found ${textResults.length} results.`); } catch {}
  } catch {
    textResults = [];
  }

  // --- Combine and deduplicate ---
  // Priority order: keyword tags > title matches > vector (semantic) > content text
  const combined = [...keywordResults, ...titleResults, ...vectorResults, ...textResults];
  const seen = new Set<string>();
  const docs: RetrievedDoc[] = [];
  for (const item of combined) {
    const title = String(item?.title || "Untitled").trim() || "Untitled";
    const content = String(item?.content || "").trim();
    if (!content) continue;
    const key = `${title}::${content.slice(0, 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({ title, content, snippet: toSnippet(content) });
  }

  // Cap at 8 documents to avoid overloading the AI context
  const finalDocs = docs.slice(0, 8);

  try {
    console.log(`✅ Final Combined Context: ${finalDocs.length} docs: [${finalDocs.map((d) => d.title).join(", ")}]`);
  } catch {}
  return finalDocs;
}
