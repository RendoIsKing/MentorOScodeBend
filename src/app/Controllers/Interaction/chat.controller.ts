import { Request, Response } from "express";
import { z } from 'zod';
import { OpenAI } from "openai";
import { findOne, Tables } from "../../../lib/db";

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || '').trim();
function getOpenAI(): OpenAI | null {
  const key = OPENAI_KEY;
  if (!key) return null;
  try { return new OpenAI({ apiKey: key }); } catch { return null; }
}

// Global guidance: Meal plan output format used by all avatars
const OUTPUT_FORMAT_MEAL_PLAN = `
When (and only when) the user asks for a meal plan, output using this exact format so a parser can read it:
- First line (macros): "<kcal> kcal, Protein: <g>g, Karb: <g>g, Fett: <g>g" (use English macros if you prefer: Protein/Carbs/Fat)
- Then one standalone heading line for each day (Norwegian or English is OK):
  Mandag / Tirsdag / Onsdag / Torsdag / Fredag / Lørdag / Søndag
  (or) Monday / Tuesday / Wednesday / Thursday / Friday / Saturday / Sunday
- Under each day, write EXACTLY these lines with the content on the same line (no extra bullets):
  - Frokost: <comma-separated items>  (or Breakfast: ...)
  - Lunsj: <items>                    (or Lunch: ...)
  - Middag: <items>                   (or Dinner: ...)
  - Snack: <items>
- Keep items as a comma-separated list on the same line; do not add sub-bullets for items.
- Put general tips at the very end under a separate heading "Guidelines" as bullet points starting with "- ".
- Avoid other markdown besides the day headings and the four meal lines.
`;

const COACH_ENGH_SYSTEM_PROMPT = `
You are Coach Engh, a world-class mental sharpness coach.
You are direct, warm, and always goal-oriented.
Start every chat by asking key questions to personalize your guidance.

When creating training plans, ALWAYS follow this exact format:
- Use Norwegian weekdays (Mandag, Tirsdag, Onsdag, Torsdag, Fredag, Lørdag, Søndag) instead of "Dag 1", "Dag 2", etc.
- End each day's workout with a motivational message, like:
  "Det var det for dagen, st\u00e5 p\u00e5! Husk m\u00e5lene du har satt deg og kjemp for \u00e5 oppn\u00e5 dem - dette f\u00e5r du til!"
  "Bra jobba! Hver dag du trener er en dag n\u00e6rmere m\u00e5let ditt. Kom igjen!"
  "St\u00e5 p\u00e5! Disiplin gir deg frihet, og hver \u00f8kt bygger styrken din. Du klarer dette!"
  "Ikke gi opp n\u00e5! Sm\u00e5 steg hver dag gir store resultater. Jeg tror p\u00e5 deg!"
  "Kjemp p\u00e5! Denne \u00f8kten gj\u00f8r deg sterkere b\u00e5de fysisk og mentalt. Gi alt du har!"
`;

/**
 * Handle chat messages for Coach Engh and return AI response.
 */
export const chatWithCoachEngh = async (req: Request, res: Response) => {
  try {
    const Body = z.object({
      message: z.string().trim().min(1).max(2000).optional(),
      history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
    });
    const parsed = Body.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ error: 'validation_failed', details: parsed.error.flatten() });
    const { message, history } = parsed.data as any;

    // If userId is available, try to load profile context via Supabase
    let profileContext = '';
    try {
      const uid = (req as any)?.user?._id || (req as any)?.user?.id;
      if (uid && typeof uid === 'string' && uid.length > 0) {
        const prof = await findOne(Tables.USER_PROFILES, { user_id: uid });
        if (prof) {
          profileContext = `KONTEKST: M\u00e5l: ${prof.goals || '-'}, Vekt: ${prof.current_weight_kg || '-'}kg, Styrker: ${prof.strengths || '-'}, Svakheter: ${prof.weaknesses || '-'}, Skader: ${prof.injury_history || '-'}, Matpreferanser: ${prof.nutrition_preferences || '-'}, Dager/uke: ${prof.training_days_per_week || '-'}`;
        }
      }
    } catch {}

    const seed: any[] = [
      { role: "system", content: COACH_ENGH_SYSTEM_PROMPT },
      { role: "system", content: OUTPUT_FORMAT_MEAL_PLAN },
      ...(profileContext ? [{ role: 'system', content: profileContext }] : []),
      {
        role: "assistant",
        content:
          "Hei! Jeg er Coach Engh. F\u00f8r vi begynner: Hva er m\u00e5let ditt n\u00e5, hva sliter du med, hvor ofte trener du, og har du matpreferanser/allergier?",
      },
    ];

    const msgs: any[] = Array.isArray(history) && history.length ? [...history] : seed;
    if (message) msgs.push({ role: "user", content: String(message) });

    if (!OPENAI_KEY) {
      const echo =
        "[Dev] OPENAI_API_KEY mangler. Midlertidig svar: " + (message ? String(message) : "Hei!");
      return res.json({ reply: echo });
    }
    const client = getOpenAI();
    if (!client) {
      const echo = "[Dev] OPENAI client init feilet. Midlertidig svar: " + (message ? String(message) : "Hei!");
      return res.json({ reply: echo });
    }
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: msgs as any,
      temperature: 0.7,
    });
    const reply = response.choices?.[0]?.message?.content || "";
    
    // Check if this is a plan proposal
    const isPlanProposal = /^(Ny|Endring p\u00e5)\s.+\n\s*##Type:\s*(Treningsplan|Kostholdsplan|M\u00e5l)\s*\n\s*Plan:\s*(.+)$/im.test(reply);
    if (isPlanProposal) {
      return res.json({ reply, type: "plan_proposal" });
    }
    
    return res.json({ reply });
  } catch (err) {
    console.error("coach-engh chat error", err);
    const msg = typeof (err as any)?.message === 'string' ? (err as any).message : 'ukjent feil';
    const echo = `[Dev fallback] ${msg}. Mitt svar: "${(req.body?.message ?? 'Hei!')}"`;
    return res.status(200).json({ reply: echo });
  }
};

const COACH_MAJEN_SYSTEM_PROMPT = `
You are Coach Majen, a pragmatic, encouraging strength and conditioning coach.
You keep answers short, concrete, and always include 1\u20132 specific next steps.
Speak like a friendly Scandinavian coach.

When creating training plans, ALWAYS follow this exact format:
- Use Norwegian weekdays (Mandag, Tirsdag, Onsdag, Torsdag, Fredag, L\u00f8rdag, S\u00f8ndag) instead of "Dag 1", "Dag 2", etc.
- End each day's workout with a motivational message from Majen, like:
  "Det var det for dagen, st\u00e5 p\u00e5! Husk m\u00e5lene du har satt deg og kjemp for \u00e5 oppn\u00e5 dem - dette f\u00e5r du til!"
  "Bra jobba! Hver dag du trener er en dag n\u00e6rmere m\u00e5let ditt. Kom igjen!"
  "St\u00e5 p\u00e5! Disiplin gir deg frihet, og hver \u00f8kt bygger styrken din. Du klarer dette!"
  "Ikke gi opp n\u00e5! Sm\u00e5 steg hver dag gir store resultater. Jeg tror p\u00e5 deg!"
  "Kjemp p\u00e5! Denne \u00f8kten gj\u00f8r deg sterkere b\u00e5de fysisk og mentalt. Gi alt du har!"

Examples of correct daily format:
Mandag: Bryst og Triceps
1. Benkpress: 4 sett x 6-8 reps
2. Skr\u00e5benk med manualer: 3 sett x 8-10 reps
3. Dips: 3 sett x 6-8 reps
- Det var det for dagen, st\u00e5 p\u00e5! Husk m\u00e5lene du har satt deg og kjemp for \u00e5 oppn\u00e5 dem - dette f\u00e5r du til!`;

/**
 * Handle chat messages for Coach Majen and return AI response.
 */
export const chatWithCoachMajen = async (req: Request, res: Response) => {
  try {
    const Body = z.object({
      message: z.string().trim().min(1).max(2000).optional(),
      history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
    });
    const parsed = Body.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ error: 'validation_failed', details: parsed.error.flatten() });
    const { message, history } = parsed.data as any;
    let profileContext = '';
    try {
      const uid = (req as any)?.user?._id || (req as any)?.user?.id;
      if (uid && typeof uid === 'string' && uid.length > 0) {
        const prof = await findOne(Tables.USER_PROFILES, { user_id: uid });
        if (prof) {
          profileContext = `KONTEKST: M\u00e5l: ${prof.goals || '-'}, Trening/uke: ${prof.training_days_per_week || '-'}, Preferanser: ${prof.nutrition_preferences || '-'}`;
        }
      }
    } catch {}

    const seed: any[] = [
      { role: 'system', content: COACH_MAJEN_SYSTEM_PROMPT },
      { role: 'system', content: OUTPUT_FORMAT_MEAL_PLAN },
      ...(profileContext ? [{ role: 'system', content: profileContext }] : []),
      { role: 'assistant', content: 'Hei! Jeg er Coach Majen. Hva trener du mot n\u00e5, hvor ofte trener du, og hva er st\u00f8rste floken?' }
    ];
    const msgs: any[] = Array.isArray(history) && history.length ? [...history] : seed;
    if (message) msgs.push({ role: 'user', content: String(message) });

    if (!OPENAI_KEY) {
      const echo = '[Dev] OPENAI_API_KEY mangler. Midlertidig svar: ' + (message ? String(message) : 'Hei!');
      return res.json({ reply: echo });
    }
    const client = getOpenAI();
    if (!client) {
      const echo = '[Dev] OPENAI client init feilet. Midlertidig svar: ' + (message ? String(message) : 'Hei!');
      return res.json({ reply: echo });
    }
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: msgs as any,
      temperature: 0.6,
    });
    const reply = response.choices?.[0]?.message?.content || '';
    
    // Check if this is a plan proposal
    const isPlanProposal = /^(Ny|Endring p\u00e5)\s.+\n\s*##Type:\s*(Treningsplan|Kostholdsplan|M\u00e5l)\s*\n\s*Plan:\s*(.+)$/im.test(reply);
    if (isPlanProposal) {
      return res.json({ reply, type: "plan_proposal" });
    }
    
    return res.json({ reply });
  } catch (e) {
    console.error('[chatWithCoachMajen] fail', e);
    const msg = typeof (e as any)?.message === 'string' ? (e as any).message : 'ukjent feil';
    const echo = `[Dev fallback] ${msg}. Mitt svar: "${(req.body?.message ?? 'Hei!')}"`;
    return res.status(200).json({ reply: echo });
  }
};
