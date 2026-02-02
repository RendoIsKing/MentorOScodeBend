import { OpenAI } from "openai";
import { Types } from "mongoose";
import { CoachKnowledge } from "../../app/Models/CoachKnowledge";
import { generateEmbedding } from "./embeddingService";

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();

function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

export async function generateResponse(
  _userId: string,
  mentorId: string,
  userMessage: string
): Promise<string> {
  const queryVector = await generateEmbedding(userMessage);
  const mentorObjectId = new Types.ObjectId(mentorId);

  const results = await CoachKnowledge.aggregate([
    {
      $vectorSearch: {
        index: "default",
        path: "embedding",
        queryVector,
        numCandidates: 100,
        limit: 3,
        filter: { userId: { $eq: mentorObjectId } },
      },
    },
    {
      $project: {
        content: 1,
        title: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ]);

  const contextData = results
    .map((item: { content?: string }) => item?.content)
    .filter(Boolean)
    .join("\n\n");

  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You are a fitness mentor. Use the following CONTEXT from your knowledge base to answer the user's question. " +
          "If the answer is not in the context, use your general fitness knowledge but mention that this specific info wasn't in your uploaded guides.\n" +
          "CONTEXT:\n" +
          (contextData || "No relevant context found."),
      },
      { role: "user", content: userMessage },
    ],
  });

  return response.choices?.[0]?.message?.content || "";
}
