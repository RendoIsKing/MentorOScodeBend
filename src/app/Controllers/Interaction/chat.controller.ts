import { Request, Response } from "express";
import { OpenAI } from "openai";
import { UserProfile } from "../../Models/UserProfile";
import { Types } from "mongoose";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COACH_ENGH_SYSTEM_PROMPT = `
You are Coach Engh, a world-class mental sharpness coach.
You are direct, warm, and always goal-oriented.
Start every chat by asking key questions to personalize your guidance.
`;

export const chatWithCoachEngh = async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body || {};

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
      ...(profileContext ? [{ role: 'system', content: profileContext }] : []),
      {
        role: "assistant",
        content:
          "Hei! Jeg er Coach Engh. Før vi begynner: Hva er målet ditt nå, hva sliter du med, hvor ofte trener du, og har du matpreferanser/allergier?",
      },
    ];

    const msgs: any[] = Array.isArray(history) && history.length ? [...history] : seed;
    if (message) msgs.push({ role: "user", content: String(message) });

    if (!process.env.OPENAI_API_KEY) {
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
    return res.json({ reply });
  } catch (err) {
    console.error("coach-engh chat error", err);
    const msg = typeof (err as any)?.message === 'string' ? (err as any).message : 'ukjent feil';
    const echo = `[Dev fallback] ${msg}. Mitt svar: "${(req.body?.message ?? 'Hei!')}"`;
    return res.status(200).json({ reply: echo });
  }
};
