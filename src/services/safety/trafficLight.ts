import { OpenAI } from "openai";

export type SafetyFlag = "green" | "yellow" | "red";

export type SafetyAnalysis = {
  status: SafetyFlag;
  flaggedCategories: string[];
};

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || "").trim();

function getOpenAI(): OpenAI {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: OPENAI_KEY });
}

const RED_CATEGORIES = [
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "violence",
  "violence/graphic",
  "sexual/minors",
];

const YELLOW_CATEGORIES = [
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "sexual",
];

function getFlaggedCategories(categories: Record<string, boolean> | undefined): string[] {
  if (!categories) return [];
  return Object.entries(categories)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

export async function analyzeSafety(text: string): Promise<SafetyAnalysis> {
  try {
    const input = String(text || "").trim();
    if (!input) return { status: "green", flaggedCategories: [] };

    const client = getOpenAI();
    const response = await client.moderations.create({ input });
    const result = response?.results?.[0];
    const flagged = Boolean(result?.flagged);
    const rawCategories = result?.categories as unknown as Record<string, unknown> | undefined;
    const categories: Record<string, boolean> = rawCategories
      ? Object.fromEntries(
          Object.entries(rawCategories).map(([key, value]) => [key, Boolean(value)])
        )
      : {};
    const flaggedCategories = getFlaggedCategories(categories);

    if (!flagged) {
      return { status: "green", flaggedCategories };
    }

    if (RED_CATEGORIES.some((c) => categories[c])) {
      return { status: "red", flaggedCategories };
    }

    if (YELLOW_CATEGORIES.some((c) => categories[c])) {
      return { status: "yellow", flaggedCategories };
    }

    return { status: "yellow", flaggedCategories };
  } catch (error) {
    return { status: "yellow", flaggedCategories: ["moderation_error"] };
  }
}

