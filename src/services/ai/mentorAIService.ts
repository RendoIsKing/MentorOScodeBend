import { OpenAI } from "openai";
import { retrieveContext } from "./ragService";
import { findById, Tables } from "../../lib/db";

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();

function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

/**
 * Fetch the mentor's personality and core instruction fields from the users table.
 * These are used to build a richer, mentor-specific system prompt.
 */
async function getMentorProfile(mentorId: string) {
  try {
    const mentor = await findById<any>(
      Tables.USERS,
      mentorId,
      "first_name, last_name, mentor_ai_voice_tone, mentor_ai_training_philosophy, " +
      "mentor_ai_nutrition_philosophy, mentor_ai_macro_approach, mentor_ai_dietary_notes, core_instructions"
    );
    return mentor;
  } catch {
    return null;
  }
}

export async function generateResponse(
  _userId: string,
  mentorId: string,
  userMessage: string
): Promise<string> {
  console.log(`[mentorAI] generateResponse called for mentor=${mentorId}, msg="${userMessage.slice(0, 80)}..."`);

  // Fetch mentor profile and RAG context in parallel (with individual error handling)
  let docs: Awaited<ReturnType<typeof retrieveContext>> = [];
  let mentorProfile: any = null;
  try {
    const [d, p] = await Promise.all([
      retrieveContext(userMessage, mentorId).catch((err) => {
        console.error("[mentorAI] retrieveContext failed:", err?.message || err);
        return [] as Awaited<ReturnType<typeof retrieveContext>>;
      }),
      getMentorProfile(mentorId),
    ]);
    docs = d;
    mentorProfile = p;
  } catch (err: any) {
    console.error("[mentorAI] Failed to fetch context/profile:", err?.message || err);
  }

  console.log(`[mentorAI] RAG docs: ${docs.length}, profile: ${mentorProfile ? "found" : "null"}`);

  const contextData = docs
    .map((item) => `Title: ${item.title}\n${item.content}`)
    .filter(Boolean)
    .join("\n\n");

  // Build the system prompt with mentor personality + core instructions + RAG context
  const parts: string[] = [];

  parts.push("You are a Mentor AI assistant.");

  // Add mentor personality / voice
  const profile = mentorProfile as any;
  if (profile) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    if (name) parts.push(`You represent the mentor "${name}".`);
    if (profile.mentor_ai_voice_tone) {
      parts.push(`VOICE & TONE: ${profile.mentor_ai_voice_tone}`);
    }
    if (profile.mentor_ai_training_philosophy) {
      parts.push(`TRAINING PHILOSOPHY: ${profile.mentor_ai_training_philosophy}`);
    }
    if (profile.mentor_ai_nutrition_philosophy) {
      parts.push(`NUTRITION PHILOSOPHY: ${profile.mentor_ai_nutrition_philosophy}`);
    }
    if (profile.mentor_ai_macro_approach) {
      parts.push(`MACRO APPROACH: ${profile.mentor_ai_macro_approach}`);
    }
    if (profile.mentor_ai_dietary_notes) {
      parts.push(`DIETARY NOTES: ${profile.mentor_ai_dietary_notes}`);
    }
  }

  // Add core instructions (permanent system prompt from Smart Ingestion Pipeline)
  if (profile?.core_instructions && String(profile.core_instructions).trim()) {
    parts.push(
      "CORE INSTRUCTIONS (these are the mentor's fundamental rules — always follow them):\n" +
      String(profile.core_instructions).trim()
    );
  }

  // RAG context
  parts.push(
    "IMPORTANT INSTRUCTIONS:\n" +
    "1. Below is CONTEXT retrieved from the mentor's knowledge base.\n" +
    "2. You MUST use this CONTEXT to answer the user's question when relevant.\n" +
    "3. If the answer is found in the CONTEXT, state it accurately.\n" +
    "4. Only fall back to your general coaching knowledge if the CONTEXT is empty or does not contain the answer.\n" +
    "CONTEXT:\n" +
    (contextData || "No relevant context found.")
  );

  console.log(`[mentorAI] Calling OpenAI gpt-4o...`);
  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    max_tokens: 1024,
    messages: [
      { role: "system", content: parts.join("\n\n") },
      { role: "user", content: userMessage },
    ],
  });

  const result = response.choices?.[0]?.message?.content || "";
  console.log(`[mentorAI] OpenAI returned ${result.length} chars`);
  return result;
}
