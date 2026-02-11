import { OpenAI } from "openai";

const OPENAI_KEY = (
  process.env.OPENAI_API_KEY ||
  process.env.OPENAI_API_TOKEN ||
  process.env.OPENAI_KEY ||
  ""
).trim();

function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

export interface RefinedKnowledge {
  summary: string;
  classification: "system_prompt" | "rag";
  keywords: string[];
  coreRules: string[];
  entities: string[];
  suggestedTitle: string;
}

/** A single message in the feedback conversation. */
export interface FeedbackMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Maximum characters to send to GPT-4o-mini for refining.
 * The model supports ~128k tokens; we use a conservative char limit
 * to avoid excessively long requests and keep latency reasonable.
 */
const MAX_REFINE_CHARS = 40000;

const REFINE_SYSTEM_PROMPT = `You are a "Knowledge Refining Agent" for a mentoring platform called Mentorio.

Your task: Analyze a document uploaded by a mentor and produce a structured JSON analysis. The mentor may be a fitness coach, nutritionist, therapist, or any self-improvement expert.

You MUST return valid JSON with exactly this schema (no markdown, no code fences):

{
  "summary": "2-4 sentence machine-readable summary of the document's core content and purpose",
  "classification": "system_prompt" or "rag",
  "keywords": ["keyword1", "keyword2", ...],
  "coreRules": ["rule1", "rule2", ...],
  "entities": ["entity1", "entity2", ...],
  "suggestedTitle": "A clean, descriptive title for the document"
}

Classification rules:
- "system_prompt": The document describes the mentor's CORE PHILOSOPHY, personality, voice, fundamental principles, or rules that should ALWAYS be active in every conversation. Examples: coaching manifesto, communication style guide, core beliefs about nutrition/training.
- "rag": The document contains SPECIFIC TACTICS, data, protocols, meal plans, exercise programs, research, or reference material that should be retrieved ON DEMAND when relevant. Examples: specific workout plans, nutrition protocols, supplement guides, client FAQs.

Keywords:
- Generate 5-15 search terms that should trigger retrieval of this document.
- Include terms in BOTH Norwegian and English when applicable.
- Include specific terms (e.g., "cravings", "søtsug") and general categories (e.g., "ernæring", "nutrition").

Core Rules:
- Extract 3-8 key principles, rules, or actionable guidelines from the document.
- If the document is data/tactical (classification: "rag"), extract the main protocols or recommendations.
- If the document is philosophical (classification: "system_prompt"), extract the mentor's core beliefs.

Entities:
- Extract named entities: exercises, diets, supplements, conditions, techniques, tools, or named programs.

Respond ONLY with the JSON object. No explanation, no markdown.`;

const FEEDBACK_CHAT_SYSTEM_PROMPT = `You are a "Knowledge Refining Assistant" for a mentoring platform called Mentorio. You are having a conversation with a mentor about a document they uploaded.

Your previous analysis of the document may have been incorrect or incomplete. The mentor is giving you feedback to help you understand the document better.

Your role in this conversation:
1. Listen carefully to the mentor's feedback
2. Explain back to them HOW you now understand the document based on their feedback
3. Ask clarifying questions if something is still unclear
4. Be concise and friendly — keep responses to 2-4 sentences
5. When you understand their feedback correctly, they will press a button to trigger a re-analysis

IMPORTANT:
- Do NOT produce JSON in this conversation. Just have a natural text conversation.
- Always end your response by summarizing your new understanding and asking "Is this correct?" or similar
- The mentor is the expert on their own content — defer to their knowledge
- Be warm and professional`;

function parseAndSanitize(raw: string, fallbackTitle: string): RefinedKnowledge {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[refiningService] Failed to parse GPT response:", raw.slice(0, 500));
    throw new Error("AI analysis returned invalid JSON");
  }

  return {
    summary: String(parsed.summary || "").trim() || "No summary generated.",
    classification:
      parsed.classification === "system_prompt" ? "system_prompt" : "rag",
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 20)
      : [],
    coreRules: Array.isArray(parsed.coreRules)
      ? parsed.coreRules.map((r: any) => String(r).trim()).filter(Boolean).slice(0, 10)
      : [],
    entities: Array.isArray(parsed.entities)
      ? parsed.entities.map((e: any) => String(e).trim()).filter(Boolean).slice(0, 20)
      : [],
    suggestedTitle:
      String(parsed.suggestedTitle || "").trim() ||
      fallbackTitle.replace(/\.[^.]+$/, ""),
  };
}

function truncateText(rawText: string): string {
  const trimmed = rawText.trim();
  return trimmed.length > MAX_REFINE_CHARS
    ? trimmed.slice(0, MAX_REFINE_CHARS) + "\n\n[...document truncated for analysis...]"
    : trimmed;
}

/**
 * Send document text to GPT-4o-mini for structured analysis.
 * Returns a RefinedKnowledge object with summary, classification, keywords, etc.
 */
export async function refineDocument(
  rawText: string,
  fileName: string
): Promise<RefinedKnowledge> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Cannot refine empty document");
  }

  const textToAnalyze = truncateText(trimmed);

  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: REFINE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `File name: "${fileName}"\n\n--- DOCUMENT CONTENT ---\n${textToAnalyze}`,
      },
    ],
  });

  const raw = response.choices?.[0]?.message?.content || "";
  return parseAndSanitize(raw, fileName);
}

/**
 * Conversational feedback: the mentor says what's wrong, and the AI responds
 * in natural language (NOT JSON) to confirm its understanding before re-analyzing.
 */
export async function feedbackChat(
  rawText: string,
  fileName: string,
  previousAnalysis: RefinedKnowledge,
  conversationHistory: FeedbackMessage[],
  latestMessage: string
): Promise<string> {
  const textToAnalyze = truncateText(rawText.trim());

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: FEEDBACK_CHAT_SYSTEM_PROMPT },
    {
      role: "user",
      content: `I uploaded a document called "${fileName}". Here is the content:\n\n--- DOCUMENT CONTENT ---\n${textToAnalyze}\n\n--- YOUR PREVIOUS ANALYSIS ---\n${JSON.stringify(previousAnalysis, null, 2)}`,
    },
    {
      role: "assistant",
      content: `I've reviewed the document "${fileName}" and produced the analysis shown above. Let me know if anything needs to be corrected — I want to make sure I understand your content correctly.`,
    },
  ];

  // Append prior conversation turns
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Append the latest mentor message
  messages.push({ role: "user", content: latestMessage });

  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.5,
    messages,
  });

  return response.choices?.[0]?.message?.content || "I understand. Shall I re-analyze the document now?";
}

/**
 * Re-refine a document incorporating full conversation history.
 * The AI sees the original analysis, the entire feedback conversation,
 * and then produces an updated JSON analysis.
 */
export async function reRefineDocument(
  rawText: string,
  fileName: string,
  previousAnalysis: RefinedKnowledge,
  conversationHistory: FeedbackMessage[]
): Promise<RefinedKnowledge> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Cannot refine empty document");
  }

  const textToAnalyze = truncateText(trimmed);

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: REFINE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `File name: "${fileName}"\n\n--- DOCUMENT CONTENT ---\n${textToAnalyze}`,
    },
    {
      role: "assistant",
      content: JSON.stringify(previousAnalysis),
    },
  ];

  // Include the full feedback conversation so the AI has all context
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Final instruction to produce updated analysis
  messages.push({
    role: "user",
    content:
      `Based on the feedback conversation above, please produce an UPDATED analysis of this document. ` +
      `The mentor knows their content best — trust their guidance about the document's purpose and meaning. ` +
      `Return the same JSON schema with corrected summary, classification, keywords, coreRules, entities, and suggestedTitle.`,
  });

  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages,
  });

  const raw = response.choices?.[0]?.message?.content || "";
  return parseAndSanitize(raw, fileName);
}
