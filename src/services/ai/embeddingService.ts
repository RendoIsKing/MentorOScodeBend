import { OpenAI } from "openai";

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();

function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cleaned = text.replace(/\n/g, " ");
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
