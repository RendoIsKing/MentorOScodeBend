import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { retrieveContext } from "./ragService";
import { findById, Tables } from "../../lib/db";
import { AGENT_TOOLS, executeTool, loadUserContext } from "./agentTools";

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();

function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

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

export interface ChatAttachment {
  url: string;
  type: string;
  filename: string;
}

// Maximum tool call rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 5;

export async function generateResponse(
  userId: string,
  mentorId: string,
  userMessage: string,
  attachments?: ChatAttachment[]
): Promise<string> {
  console.log(`[mentorAI] generateResponse called for user=${userId}, mentor=${mentorId}, msg="${userMessage.slice(0, 80)}...", attachments=${attachments?.length || 0}`);

  // Fetch mentor profile, RAG context, and user context in parallel
  let docs: Awaited<ReturnType<typeof retrieveContext>> = [];
  let mentorProfile: any = null;
  let userContext: Record<string, string> = {};

  try {
    const [d, p, ctx] = await Promise.all([
      retrieveContext(userMessage, mentorId).catch((err) => {
        console.error("[mentorAI] retrieveContext failed:", err?.message || err);
        return [] as Awaited<ReturnType<typeof retrieveContext>>;
      }),
      getMentorProfile(mentorId),
      loadUserContext(userId),
    ]);
    docs = d;
    mentorProfile = p;
    userContext = ctx;
  } catch (err: any) {
    console.error("[mentorAI] Failed to fetch context/profile:", err?.message || err);
  }

  console.log(`[mentorAI] RAG docs: ${docs.length}, profile: ${mentorProfile ? "found" : "null"}, userContext keys: ${Object.keys(userContext).length}`);

  const contextData = docs
    .map((item) => `Title: ${item.title}\n${item.content}`)
    .filter(Boolean)
    .join("\n\n");

  // ── Build the system prompt ───────────────────────────────────────────────
  const parts: string[] = [];

  parts.push(
    "You are a Mentor AI assistant. You MUST always respond in Norwegian (Bokmål). " +
    "Never respond in English, Danish, or Swedish unless the user explicitly asks for it."
  );

  // TTS expression tags
  parts.push(
    "SPEECH EXPRESSIVENESS TAGS:\n" +
    "Your responses will be read aloud using text-to-speech. " +
    "To make your voice sound natural and warm, you may sprinkle in the following audio tags " +
    "sparingly and where they feel natural:\n" +
    "  [laughs] — when something is funny or light-hearted\n" +
    "  [happily] — when giving positive feedback or encouragement\n" +
    "  [sighs] — when showing empathy or understanding frustration\n" +
    "  [excited] — when celebrating progress or achievements\n" +
    "  [whispers] — for emphasis on something important or intimate\n" +
    "DO NOT overuse these tags. Use at most 1-2 per response. " +
    "Place them at the start of a sentence or naturally within the flow. " +
    "Most responses should have zero tags — only use them when it truly adds warmth."
  );

  // Tool usage instructions
  parts.push(
    "TOOL USAGE INSTRUCTIONS:\n" +
    "You have access to tools that let you perform real actions for the user.\n" +
    "IMPORTANT RULES:\n" +
    "1. When the user sends a FOOD PHOTO or describes food: analyze it, then call log_meal with your best estimate of macros. " +
    "Present the analysis to the user and ask them to confirm or correct before you say it's saved.\n" +
    "2. When the user mentions their weight: call log_weight.\n" +
    "3. When the user describes a workout they did: call log_workout.\n" +
    "4. When you learn something important about the user (allergies, injuries, preferences): call update_user_context.\n" +
    "5. Call get_user_stats when you need the user's current data to give personalized advice.\n" +
    "6. Call get_meal_history when discussing nutrition patterns or reviewing what they've eaten.\n" +
    "7. After calling a tool, report the result naturally in your response. Don't show raw JSON.\n" +
    "8. You can call multiple tools in one response if needed."
  );

  // Mentor personality
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

  // Core instructions
  if (profile?.core_instructions && String(profile.core_instructions).trim()) {
    parts.push(
      "CORE INSTRUCTIONS (these are the mentor's fundamental rules — always follow them):\n" +
      String(profile.core_instructions).trim()
    );
  }

  // User context (remembered facts)
  if (Object.keys(userContext).length > 0) {
    const ctxLines = Object.entries(userContext)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    parts.push(
      "USER CONTEXT (facts you have previously learned about this user — use them to personalize):\n" + ctxLines
    );
  }

  // RAG context
  parts.push(
    "KNOWLEDGE BASE CONTEXT:\n" +
    "1. Below is CONTEXT retrieved from the mentor's knowledge base.\n" +
    "2. You MUST use this CONTEXT to answer the user's question when relevant.\n" +
    "3. If the answer is found in the CONTEXT, state it accurately.\n" +
    "4. Only fall back to your general coaching knowledge if the CONTEXT is empty or does not contain the answer.\n" +
    "CONTEXT:\n" +
    (contextData || "No relevant context found.")
  );

  // Media instruction
  const imageAttachments = (attachments || []).filter(a => a.type.startsWith("image/"));
  const videoAttachments = (attachments || []).filter(a => a.type.startsWith("video/"));
  if (imageAttachments.length > 0 || videoAttachments.length > 0) {
    parts.push(
      "The user has sent media (images/videos). Analyze them carefully.\n" +
      "If the images show FOOD: estimate each item, its weight, and macros. Then call log_meal to save it.\n" +
      "If the images show exercises or body posture: provide coaching feedback.\n" +
      "If they show progress photos: comment encouragingly on visible changes and call update_user_context if you learn something new."
    );
  }

  // ── Build user content (multi-modal) ──────────────────────────────────────
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [];
  userContent.push({ type: "text", text: userMessage });

  for (const att of imageAttachments) {
    const imageUrl = att.url.startsWith("http") ? att.url : `${process.env.FRONTEND_ORIGIN || ""}${att.url}`;
    userContent.push({
      type: "image_url",
      image_url: { url: imageUrl, detail: "auto" },
    });
  }

  // ── Call OpenAI with tools (loop for tool calls) ──────────────────────────
  const client = getOpenAI();
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: parts.join("\n\n") },
    { role: "user", content: userContent as any },
  ];

  let round = 0;
  while (round < MAX_TOOL_ROUNDS) {
    round++;
    console.log(`[mentorAI] OpenAI call round ${round}...`);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 1500,
      messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
    });

    const choice = response.choices?.[0];
    if (!choice) {
      console.error("[mentorAI] No choices returned from OpenAI");
      return "Beklager, noe gikk galt. Prøv igjen.";
    }

    const assistantMessage = choice.message;

    // Add assistant message to conversation history
    messages.push(assistantMessage as ChatCompletionMessageParam);

    // If no tool calls, we have the final response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      const result = assistantMessage.content || "";
      console.log(`[mentorAI] Final response after ${round} round(s): ${result.length} chars`);
      return result;
    }

    // Execute all tool calls in parallel
    console.log(`[mentorAI] ${assistantMessage.tool_calls.length} tool call(s) to execute`);

    const toolResults = await Promise.all(
      assistantMessage.tool_calls.map(async (tc) => {
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }

        const result = await executeTool(tc.function.name, args, userId);
        return {
          toolCallId: tc.id,
          result,
        };
      })
    );

    // Add tool results to conversation
    for (const tr of toolResults) {
      messages.push({
        role: "tool",
        tool_call_id: tr.toolCallId,
        content: JSON.stringify(tr.result),
      } as ChatCompletionMessageParam);
    }

    // Loop continues — OpenAI will now see the tool results and can either
    // call more tools or return a final text response
  }

  // Safety: if we exhaust rounds, return whatever we have
  console.warn(`[mentorAI] Exhausted ${MAX_TOOL_ROUNDS} tool rounds`);
  const lastAssistantMsg = messages.filter(m => m.role === "assistant").pop();
  return (lastAssistantMsg as any)?.content || "Beklager, det tok for lang tid å prosessere forespørselen.";
}
