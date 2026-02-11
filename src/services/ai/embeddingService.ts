import { OpenAI } from "openai";

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();

// text-embedding-3-small supports up to 8191 tokens.
// As a rough heuristic, 1 token ≈ 4 characters for English/Norwegian text.
// We use a conservative limit to stay well under the token cap.
const MAX_EMBEDDING_CHARS = 28000;

function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

export async function generateEmbedding(text: string): Promise<number[]> {
  let cleaned = text.replace(/\n/g, " ").trim();
  // Truncate to fit within the model's token limit
  if (cleaned.length > MAX_EMBEDDING_CHARS) {
    console.warn(
      `[embeddingService] Text truncated from ${cleaned.length} to ${MAX_EMBEDDING_CHARS} chars for embedding`
    );
    cleaned = cleaned.slice(0, MAX_EMBEDDING_CHARS);
  }
  const client = getOpenAI();
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: cleaned,
  });
  const embedding = response.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("Embedding generation failed");
  }
  return embedding;
}
