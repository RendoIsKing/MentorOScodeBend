export type SafetyFlag = "green" | "yellow" | "red";

const RED_KEYWORDS = [
  "suicide",
  "self-harm",
  "self harm",
  "kill myself",
  "end my life",
  "overdose",
  "die",
  "kill",
  "murder",
  "rape",
  "violent",
  "violence",
  "weapon",
  "gun",
  "knife",
  "bomb",
  "terror",
];

const YELLOW_KEYWORDS = [
  "hate",
  "angry",
  "furious",
  "panic",
  "threat",
  "abuse",
  "harass",
  "stalk",
  "unsafe",
  "scared",
  "depressed",
  "anxious",
];

function normalize(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

export async function analyzeSafety(text: string): Promise<SafetyFlag> {
  const normalized = normalize(text);
  if (!normalized) return "green";
  if (matchAny(normalized, RED_KEYWORDS)) return "red";
  if (matchAny(normalized, YELLOW_KEYWORDS)) return "yellow";
  return "green";
}

