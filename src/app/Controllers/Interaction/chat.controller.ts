import { Request, Response } from "express";
import { z } from 'zod';
import { OpenAI } from "openai";
import { UserProfile } from "../../Models/UserProfile";
import { Types } from "mongoose";

const OPENAI_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_KEY || '').trim();
const openai = new OpenAI({ apiKey: OPENAI_KEY || undefined });

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
  "Det var det for dagen, stå på! Husk målene du har satt deg og kjemp for å oppnå dem - dette får du til!"
  "Bra jobba! Hver dag du trener er en dag nærmere målet ditt. Kom igjen!"
  "Stå på! Disiplin gir deg frihet, og hver økt bygger styrken din. Du klarer dette!"
  "Ikke gi opp nå! Små steg hver dag gir store resultater. Jeg tror på deg!"
  "Kjemp på! Denne økten gjør deg sterkere både fysisk og mentalt. Gi alt du har!"
`;

export const chatWithCoachEngh = async (req: Request, res: Response) => {
  try {
    const Body = z.object({
      message: z.string().trim().min(1).max(2000).optional(),
      history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
    });
    const parsed = Body.safeParse(req.body || {});
    if (!parsed.success) return res.status(422).json({ error: 'validation_failed', details: parsed.error.flatten() });
    const { message, history } = parsed.data as any;

    // If userId cookie is available, try to load profile context
    let profileContext = '';
    try {
      const uid = (req as any)?.user?._id || (req.cookies?.auth_token ? undefined : undefined);
      if (uid && Types.ObjectId.isValid(uid)) {
        const prof = await UserProfile.findOne({ userId: new Types.ObjectId(uid) }).lean();
        if (prof) {
          profileContext = `KONTEKST: Mål: ${prof.goals || '-'}, Vekt: ${prof.currentWeightKg || '-'}kg, Styrker: ${prof.strengths || '-'}, Svakheter: ${prof.weaknesses || '-'}, Skader: ${prof.injuryHistory || '-'}, Matpreferanser: ${prof.nutritionPreferences || '-'}, Dager/uke: ${prof.trainingDaysPerWeek || '-'}`;
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
          "Hei! Jeg er Coach Engh. Før vi begynner: Hva er målet ditt nå, hva sliter du med, hvor ofte trener du, og har du matpreferanser/allergier?",
      },
    ];

    const msgs: any[] = Array.isArray(history) && history.length ? [...history] : seed;
    if (message) msgs.push({ role: "user", content: String(message) });

    if (!OPENAI_KEY) {
      const echo =
        "[Dev] OPENAI_API_KEY mangler. Midlertidig svar: " + (message ? String(message) : "Hei!");
      return res.json({ reply: echo });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: msgs as any,
      temperature: 0.7,
    });
    const reply = response.choices?.[0]?.message?.content || "";
    
    // Check if this is a plan proposal (updated to handle Norwegian weekdays and motivational endings)
    const isPlanProposal = /^(Ny|Endring på)\s.+\n\s*##Type:\s*(Treningsplan|Kostholdsplan|Mål)\s*\n\s*Plan:\s*(.+)$/im.test(reply);
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
You keep answers short, concrete, and always include 1–2 specific next steps.
Speak like a friendly Scandinavian coach.

When creating training plans, ALWAYS follow this exact format:
- Use Norwegian weekdays (Mandag, Tirsdag, Onsdag, Torsdag, Fredag, Lørdag, Søndag) instead of "Dag 1", "Dag 2", etc.
- End each day's workout with a motivational message from Majen, like:
  "Det var det for dagen, stå på! Husk målene du har satt deg og kjemp for å oppnå dem - dette får du til!"
  "Bra jobba! Hver dag du trener er en dag nærmere målet ditt. Kom igjen!"
  "Stå på! Disiplin gir deg frihet, og hver økt bygger styrken din. Du klarer dette!"
  "Ikke gi opp nå! Små steg hver dag gir store resultater. Jeg tror på deg!"
  "Kjemp på! Denne økten gjør deg sterkere både fysisk og mentalt. Gi alt du har!"

Examples of correct daily format:
Mandag: Bryst og Triceps
1. Benkpress: 4 sett x 6-8 reps
2. Skråbenk med manualer: 3 sett x 8-10 reps
3. Dips: 3 sett x 6-8 reps
- Det var det for dagen, stå på! Husk målene du har satt deg og kjemp for å oppnå dem - dette får du til!`;

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
      const uid = (req as any)?.user?._id;
      if (uid && Types.ObjectId.isValid(uid)) {
        const prof = await UserProfile.findOne({ userId: new Types.ObjectId(uid) }).lean();
        if (prof) {
          profileContext = `KONTEKST: Mål: ${prof.goals || '-'}, Trening/uke: ${prof.trainingDaysPerWeek || '-'}, Preferanser: ${prof.nutritionPreferences || '-'}`;
        }
      }
    } catch {}

    const seed: any[] = [
      { role: 'system', content: COACH_MAJEN_SYSTEM_PROMPT },
      { role: 'system', content: OUTPUT_FORMAT_MEAL_PLAN },
      ...(profileContext ? [{ role: 'system', content: profileContext }] : []),
      { role: 'assistant', content: 'Hei! Jeg er Coach Majen. Hva trener du mot nå, hvor ofte trener du, og hva er største floken?' }
    ];
    const msgs: any[] = Array.isArray(history) && history.length ? [...history] : seed;
    if (message) msgs.push({ role: 'user', content: String(message) });

    if (!OPENAI_KEY) {
      const echo = '[Dev] OPENAI_API_KEY mangler. Midlertidig svar: ' + (message ? String(message) : 'Hei!');
      return res.json({ reply: echo });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: msgs as any,
      temperature: 0.6,
    });
    const reply = response.choices?.[0]?.message?.content || '';
    
    // Check if this is a plan proposal (updated to handle Norwegian weekdays and motivational endings)
    const isPlanProposal = /^(Ny|Endring på)\s.+\n\s*##Type:\s*(Treningsplan|Kostholdsplan|Mål)\s*\n\s*Plan:\s*(.+)$/im.test(reply);
    if (isPlanProposal) {
      return res.json({ reply, type: "plan_proposal" });
    }
    
    return res.json({ reply });
  } catch (e) {
    console.error('[chatWithCoachMajen] fail', e);
    // Mirror Engh behavior: return a friendly fallback reply (HTTP 200)
    const msg = typeof (e as any)?.message === 'string' ? (e as any).message : 'ukjent feil';
    const echo = `[Dev fallback] ${msg}. Mitt svar: "${(req.body?.message ?? 'Hei!')}"`;
    return res.status(200).json({ reply: echo });
  }
};
