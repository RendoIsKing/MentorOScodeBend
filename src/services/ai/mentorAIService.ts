import { OpenAI } from "openai";
import { retrieveContext } from "./ragService";

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
  const docs = await retrieveContext(userMessage, mentorId);
  const contextData = docs
    .map((item) => `Title: ${item.title}\n${item.content}`)
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
          "If the answer is not in the context, say you don't know.\n" +
          "CONTEXT:\n" +
          (contextData || "No relevant context found."),
      },
      { role: "user", content: userMessage },
    ],
  });

  return response.choices?.[0]?.message?.content || "";
}
