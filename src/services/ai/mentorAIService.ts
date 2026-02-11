import { OpenAI } from "openai";
import { retrieveContext } from "./ragService";
import { User } from "../../app/Models/User";

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();

function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

/**
 * Fetch the mentor's personality and core instruction fields from the User document.
 * These are used to build a richer, mentor-specific system prompt.
 */
async function getMentorProfile(mentorId: string) {
  try {
    const mentor = await User.findById(mentorId)
      .select(
        "firstName lastName mentorAiVoiceTone mentorAiTrainingPhilosophy " +
        "mentorAiNutritionPhilosophy mentorAiMacroApproach mentorAiDietaryNotes coreInstructions"
      )
      .lean();
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
    const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    if (name) parts.push(`You represent the mentor "${name}".`);
    if (profile.mentorAiVoiceTone) {
      parts.push(`VOICE & TONE: ${profile.mentorAiVoiceTone}`);
    }
    if (profile.mentorAiTrainingPhilosophy) {
      parts.push(`TRAINING PHILOSOPHY: ${profile.mentorAiTrainingPhilosophy}`);
    }
    if (profile.mentorAiNutritionPhilosophy) {
      parts.push(`NUTRITION PHILOSOPHY: ${profile.mentorAiNutritionPhilosophy}`);
    }
    if (profile.mentorAiMacroApproach) {
      parts.push(`MACRO APPROACH: ${profile.mentorAiMacroApproach}`);
    }
    if (profile.mentorAiDietaryNotes) {
      parts.push(`DIETARY NOTES: ${profile.mentorAiDietaryNotes}`);
    }
  }

  // Add core instructions (permanent system prompt from Smart Ingestion Pipeline)
  if (profile?.coreInstructions && String(profile.coreInstructions).trim()) {
    parts.push(
      "CORE INSTRUCTIONS (these are the mentor's fundamental rules — always follow them):\n" +
      String(profile.coreInstructions).trim()
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
