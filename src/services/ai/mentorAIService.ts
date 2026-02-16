import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { retrieveContext } from "./ragService";
import { findById, findOne, Tables } from "../../lib/db";
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
  attachments?: ChatAttachment[],
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  console.log(`[mentorAI] generateResponse called for user=${userId}, mentor=${mentorId}, msg="${userMessage.slice(0, 80)}...", attachments=${attachments?.length || 0}`);

  // Fetch mentor profile, RAG context, user context, and onboarding profile in parallel
  let docs: Awaited<ReturnType<typeof retrieveContext>> = [];
  let mentorProfile: any = null;
  let userContext: Record<string, string> = {};
  let onboardingProfile: any = null;

  try {
    const [d, p, ctx, obProfile] = await Promise.all([
      retrieveContext(userMessage, mentorId).catch((err) => {
        console.error("[mentorAI] retrieveContext failed:", err?.message || err);
        return [] as Awaited<ReturnType<typeof retrieveContext>>;
      }),
      getMentorProfile(mentorId),
      loadUserContext(userId),
      findOne(Tables.USER_PROFILES, { user_id: userId }).catch(() => null),
    ]);
    docs = d;
    mentorProfile = p;
    userContext = ctx;
    onboardingProfile = obProfile;
  } catch (err: any) {
    console.error("[mentorAI] Failed to fetch context/profile:", err?.message || err);
  }

  console.log(`[mentorAI] RAG docs: ${docs.length}, profile: ${mentorProfile ? "found" : "null"}, userContext keys: ${Object.keys(userContext).length}, onboarding: ${onboardingProfile ? "found" : "null"}`);

  const contextData = docs
    .map((item) => `Title: ${item.title}\n${item.content}`)
    .filter(Boolean)
    .join("\n\n");

  // ── Build the system prompt ───────────────────────────────────────────────
  const parts: string[] = [];

  parts.push(
    "You are a Mentor AI assistant. You MUST always respond in Norwegian (Bokmål). " +
    "Never respond in English, Danish, or Swedish unless the user explicitly asks for it.\n\n" +

    "VIKTIG REGEL - IKKE SPØR OM INFO DU ALLEREDE HAR:\n" +
    "Du har tilgang til brukerens profil og onboarding-data (se BRUKERENS ONBOARDING-PROFIL og USER CONTEXT nedenfor). " +
    "ALDRI spør om informasjon som allerede finnes i disse dataene. Hvis brukeren har oppgitt at de trener 5 dager " +
    "i uken og har tilgang på treningssenter, IKKE spør om dette igjen. Bruk dataene du har.\n" +
    "Hvis brukerens data mangler noe kritisk (f.eks. skader), kan du spørre ÉN gang og kort.\n\n" +

    "SAMTALEOPPSTART:\n" +
    "Når en bruker sender sin FØRSTE melding:\n" +
    "1. Ønsk velkommen varmt (bruk navnet deres)\n" +
    "2. Oppsummer KORT hva du vet om dem (mål, vekt, treningsdager, utstyr)\n" +
    "3. Spør om det er noe viktig du bør vite (skader, allergier) som IKKE allerede finnes i dataene\n" +
    "4. Tilby å lage en plan med en gang\n\n" +

    "NÅR BRUKEREN BER OM EN PLAN:\n" +
    "Hvis brukeren ber om en treningsplan, kostholdsplan, eller mål — LAG PLANEN MED EN GANG. " +
    "Du har allerede nok informasjon fra onboarding-dataen. Ikke spør om mer info med mindre " +
    "det mangler noe helt kritisk. Presenter planen i chatten, og spør om de vil godkjenne den " +
    "eller gjøre endringer. Når de godkjenner, lagre den til Student senteret.\n\n" +

    "STUDENT SENTER-INTEGRASJON:\n" +
    "Du har direkte tilgang til brukerens Student Senter. Endringer du gjør vises umiddelbart i appen:\n" +
    "- save_training_plan: Treningsplan -> 'Aktivitet'-fanen\n" +
    "- save_nutrition_plan: Kostholdsplan -> 'Ernæring'-fanen\n" +
    "- save_goal: Mål -> Dashboard\n" +
    "- update_profile: Oppdater brukerens profil\n" +
    "- log_meal / log_weight / log_workout: Logg daglig aktivitet\n" +
    "- get_user_stats: Hent brukerens nåværende statistikk og eksisterende planer\n\n" +

    "PLANLEGGINGSFLYT:\n" +
    "1. Bruk eksisterende data til å lage planen (IKKE spør om info du har)\n" +
    "2. Presenter planen i chatten\n" +
    "3. Spør: 'Skal jeg lagre denne planen i Student senteret ditt?'\n" +
    "4. Når godkjent: KALL save_training_plan / save_nutrition_plan / save_goal MED HELE PLANEN\n" +
    "   For save_training_plan MÅ du sende days-array med: [{day: 'Mandag', focus: 'Bryst og Triceps', exercises: [{name: 'Benkpress', sets: 4, reps: '6-8'}, ...]}, ...]\n" +
    "   For save_nutrition_plan MÅ du sende daily_targets: {kcal, protein_g, carbs_g, fat_g} og meals-array\n" +
    "5. Bekreft at planen er lagret og fortell brukeren: 'Du finner den i Aktivitet-fanen / Ernæring-fanen'\n\n" +

    "KRITISK REGEL FOR PLANLAGRING:\n" +
    "Når brukeren sier 'lagre', 'ja', 'ok', 'gjør det', 'legg til i student senteret', 'logg den' — " +
    "KALL VERKTØYET DIREKTE. Ikke spør 'hvilken plan?' eller 'kan du bekrefte?' — du NETTOPP presenterte planen, " +
    "du VET hvilken plan det er. Kall verktøyet med den planen du presenterte.\n\n" +

    "Vær varm, tydelig og handlingsorientert. Led brukeren steg for steg."
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

  // Tool usage instructions - CRITICAL
  parts.push(
    "TOOL USAGE INSTRUCTIONS — DU MÅ FØLGE DISSE:\n" +
    "Du har tilgang til verktøy som gjør EKTE handlinger i brukerens Student Senter.\n" +
    "ALDRI si at du har gjort noe uten å faktisk kalle verktøyet. Hvis du sier 'Jeg har logget vekten din' MÅ du ha kalt log_weight.\n\n" +

    "OBLIGATORISKE VERKTØYKALL:\n" +
    "- Bruker nevner vekt (f.eks. 'Jeg veier 80 kg', 'veide meg: 80'): KALL log_weight UMIDDELBART\n" +
    "- Bruker beskriver mat/måltid: KALL log_meal med beste estimat av makroer\n" +
    "- Bruker beskriver trening de har gjort: KALL log_workout\n" +
    "- Bruker godkjenner en treningsplan: KALL save_training_plan med ALLE dagene og øvelsene\n" +
    "- Bruker godkjenner en kostholdsplan: KALL save_nutrition_plan med daglige mål og måltider\n" +
    "- Bruker godkjenner mål: KALL save_goal\n" +
    "- Du lærer noe nytt om brukeren: KALL update_user_context\n\n" +

    "NÅR BRUKEREN GODKJENNER EN PLAN:\n" +
    "Når brukeren sier noe som 'lagre', 'ja', 'godkjent', 'legg til', 'lagre i student senteret' — " +
    "da MÅ du UMIDDELBART kalle save_training_plan eller save_nutrition_plan med den KOMPLETTE planen.\n" +
    "Du MÅ inkludere ALLE dagene med ALLE øvelsene i verktøykallet. Ikke spør om mer info.\n" +
    "Eksempel for save_training_plan: days-arrayet skal inneholde hvert dag-objekt med day, focus, og exercises (name, sets, reps).\n\n" +

    "VIKTIG:\n" +
    "- Si ALDRI 'Jeg har logget/lagret X' uten å faktisk ha kalt det relevante verktøyet\n" +
    "- Kall verktøy FØRST, og rapporter resultatet etterpå\n" +
    "- Du kan kalle flere verktøy i én respons\n" +
    "- Etter et verktøykall, bekreft hva som skjedde og fortell brukeren hvor de finner det i Student Senteret"
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

  // Onboarding profile data (from the coach onboarding form + user_profiles table)
  if (onboardingProfile) {
    const ob = onboardingProfile;
    const profileLines: string[] = [];
    if (ob.goals) profileLines.push(`Mål: ${ob.goals}`);
    if (ob.current_weight_kg) profileLines.push(`Nåværende vekt: ${ob.current_weight_kg} kg`);
    if (ob.training_days_per_week) profileLines.push(`Treningsdager per uke: ${ob.training_days_per_week}`);
    if (ob.nutrition_preferences) profileLines.push(`Matpreferanser: ${ob.nutrition_preferences}`);
    if (ob.strengths) profileLines.push(`Styrker: ${ob.strengths}`);
    if (ob.weaknesses) profileLines.push(`Svakheter: ${ob.weaknesses}`);
    if (ob.injury_history) profileLines.push(`Skadehistorikk: ${ob.injury_history}`);
    if (profileLines.length > 0) {
      parts.push(
        "BRUKERENS ONBOARDING-PROFIL (data brukeren fylte inn ved registrering):\n" +
        profileLines.join("\n")
      );
    }
  }

  // User context (remembered facts from onboarding + agent conversations)
  // These contain rich onboarding data: navn, alder, kjønn, vekt, høyde, mål, utstyr, etc.
  if (Object.keys(userContext).length > 0) {
    const ctxLines = Object.entries(userContext)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    parts.push(
      "BRUKERENS DATA (fakta du har om denne brukeren — BRUK DETTE, IKKE SPØR PÅ NYTT):\n" +
      ctxLines + "\n\n" +
      "VIKTIG: Alt over er data som brukeren allerede har gitt deg. " +
      "DU MÅ ALDRI spørre om noe som allerede finnes i listen over. " +
      "Bruk denne informasjonen aktivt når du lager planer og gir råd."
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
  ];

  // Include conversation history so the AI has context of previous messages
  if (conversationHistory && conversationHistory.length > 0) {
    // Limit to last 15 messages to stay within token budget
    const recent = conversationHistory.slice(-15);
    for (const msg of recent) {
      messages.push({ role: msg.role, content: msg.content });
    }
    console.log(`[mentorAI] Including ${recent.length} messages of conversation history`);
  }

  messages.push({ role: "user", content: userContent as any });

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
