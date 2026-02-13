import { db, rpc, Tables } from "../../lib/db";
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

  if (!mentorId) {
    console.log(`⚠️ Missing mentorId for RAG`);
    return [];
  }

  console.log(`🔍 RAG Lookup started for mentorId: ${mentorId} with query: ${cleaned}`);

  const searchTokens = extractSearchTokens(cleaned);
  console.log(`🔑 Search tokens: [${searchTokens.join(", ")}]`);

  // --- Strategy 1: Vector (semantic) search via Supabase RPC ---
  let vectorResults: Array<{ id: string; title: string; content: string; similarity: number }> = [];
  try {
    const queryVector = await generateEmbedding(cleaned);
    const results = await rpc<Array<{ id: string; title: string; content: string; similarity: number }>>(
      "match_knowledge",
      {
        query_embedding: JSON.stringify(queryVector),
        match_user_id: mentorId,
        match_threshold: 0.5,
        match_count: 6,
      }
    );
    vectorResults = results || [];
    console.log(
      `🧩 Vector Search found ${vectorResults.length} results:`,
      vectorResults.map((r) => `"${r.title}" (score: ${(r.similarity ?? 0).toFixed(3)})`).join(", ")
    );
  } catch (err) {
    console.error("Vector search failed:", err);
    vectorResults = [];
  }

  // --- Strategy 2: Keyword tag search (Smart Ingestion Pipeline keywords) ---
  let keywordResults: Array<{ title: string; content: string }> = [];
  try {
    if (searchTokens.length) {
      // Use Supabase ilike + or for keyword matching across the keywords array
      const orConditions = searchTokens
        .map((word) => `keywords.cs.{${word}}`)
        .join(",");

      const { data } = await db
        .from(Tables.COACH_KNOWLEDGE)
        .select("title, content")
        .eq("user_id", mentorId)
        .or(searchTokens.map((word) => `keywords.cs.{"${word}"}`).join(","))
        .limit(5);

      keywordResults = (data || []) as any;
      console.log(`🏷️ Keyword Tag Search found ${keywordResults.length} results.`);
    }
  } catch {
    keywordResults = [];
  }

  // --- Strategy 3: Title search (match document titles) ---
  let titleResults: Array<{ title: string; content: string }> = [];
  try {
    if (searchTokens.length) {
      const orConditions = searchTokens
        .map((word) => `title.ilike.%${word}%`)
        .join(",");

      const { data } = await db
        .from(Tables.COACH_KNOWLEDGE)
        .select("title, content")
        .eq("user_id", mentorId)
        .or(orConditions)
        .limit(4);

      titleResults = (data || []) as any;
      console.log(`📄 Title Search found ${titleResults.length} results.`);
    }
  } catch {
    titleResults = [];
  }

  // --- Strategy 4: Content text search (fallback ilike on content) ---
  let textResults: Array<{ title: string; content: string }> = [];
  try {
    if (searchTokens.length) {
      const orConditions = searchTokens
        .map((word) => `content.ilike.%${word}%`)
        .join(",");

      const { data } = await db
        .from(Tables.COACH_KNOWLEDGE)
        .select("title, content")
        .eq("user_id", mentorId)
        .or(orConditions)
        .limit(5);

      textResults = (data || []) as any;
    } else {
      textResults = [];
    }
    console.log(`📝 Text/Fallback Search found ${textResults.length} results.`);
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

  console.log(`✅ Final Combined Context: ${finalDocs.length} docs: [${finalDocs.map((d) => d.title).join(", ")}]`);
  return finalDocs;
}
