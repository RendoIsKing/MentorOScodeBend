import { Types } from "mongoose";
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

  const mentorObjectId = new Types.ObjectId(mentorId);
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
          filter: { userId: { $eq: mentorObjectId } },
        },
      },
      { $project: { content: 1, title: 1, score: { $meta: "vectorSearchScore" } } },
    ];
    vectorResults = await CoachKnowledge.aggregate(pipeline);
  } catch {
    vectorResults = [];
  }

  let textResults: Array<{ title?: string; content?: string }> = [];
  try {
    const q = escapeRegex(cleaned);
    textResults = (await CoachKnowledge.find({
      userId: mentorObjectId,
      content: { $regex: q, $options: "i" },
    })
      .limit(3)
      .lean()) as any;
  } catch {
    textResults = [];
  }

  const combined = [...vectorResults, ...textResults];
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
  return docs;
}
