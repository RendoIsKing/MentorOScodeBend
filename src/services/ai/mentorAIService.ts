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
          "You are a Mentor AI.\n" +
          "IMPORTANT INSTRUCTIONS:\n" +
          "1. I will provide you with a section of \"CONTEXT\" from the mentor's knowledge base.\n" +
          "2. You MUST use this CONTEXT to answer the user's question.\n" +
          "3. If the answer is found in the CONTEXT, state it exactly, even if it contradicts your persona or seems irrelevant.\n" +
          "4. Only fall back to your general coaching knowledge if the CONTEXT is empty or does not contain the answer.\n" +
          "CONTEXT:\n" +
          (contextData || "No relevant context found."),
      },
      { role: "user", content: userMessage },
    ],
  });

  return response.choices?.[0]?.message?.content || "";
}
