import crypto from "crypto";
import ProfileModel from "../../models/Profile";
import { PlanPreview as IPlanPreview, PreviewDay, PreviewExercise } from "../../models/PlanPreview";

type GenInput = {
  userId: string;
  profile: Awaited<ReturnType<typeof ProfileModel.findOne>>;
};

const dayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function subForInjury(name: string, injuries: string[] = []): { name: string; rationale?: string } {
  if (injuries.includes("knee")) {
    if (/squat/i.test(name)) return { name: "Leg Press", rationale: "Knee-friendly swap for Squat" };
    if (/lunge/i.test(name)) return { name: "Step-ups", rationale: "Reduced knee shear vs Lunges" };
  }
  return { name };
}

function baseExercises(exp: string): PreviewExercise[] {
  const ex: PreviewExercise[] = [
    { name: "Back Squat", sets: 3, reps: "8-10", rpe: "7-8" },
    { name: "Bench Press", sets: 3, reps: "6-8",  rpe: "7-8" },
    { name: "Lat Pulldown", sets: 3, reps: "10-12", rpe: "7-8" },
  ];
  if (exp === "beginner") return ex;
  if (exp === "intermediate") return [...ex, { name: "Romanian Deadlift", sets: 3, reps: "6-8", rpe: "7-8" }];
  return [...ex, { name: "Romanian Deadlift", sets: 4, reps: "5-7", rpe: "8" }];
}

export function kcalFrom(profile: any): number {
  const bw = profile?.bodyWeightKg ?? 70;
  const mult = profile?.goals === "cut" ? 28 : profile?.goals === "gain" ? 33 : 30;
  return Math.round(bw * mult);
}

export function macrosFrom(profile: any, kcal: number) {
  const bw = profile?.bodyWeightKg ?? 70;
  const proteinPerKg = profile?.diet === "vegan" ? 2.2 : 2.0;
  const protein = Math.round(bw * proteinPerKg);
  const kcalAfterProtein = Math.max(kcal - protein * 4, 0);
  const carbs = Math.round((kcalAfterProtein * 0.55) / 4);
  const fat = Math.round((kcalAfterProtein * 0.45) / 9);
  return { proteinGrams: protein, carbsGrams: carbs, fatGrams: fat };
}

export function generateDeterministicPreview({ userId, profile }: GenInput): IPlanPreview {
  const p: any = profile || {};
  const exp = p?.experienceLevel ?? "beginner";
  const injuries = p?.injuries ?? [];

  const days: PreviewDay[] = dayNames.map((d, i) => {
    if (exp === "beginner") {
      if ([0,2,4].includes(i)) {
        const ex = baseExercises(exp).map(e => {
          const swap = subForInjury(e.name, injuries);
          return { ...e, name: swap.name, rationale: swap.rationale };
        });
        return { day: d, focus: "Full Body", exercises: ex };
      }
      if ([1,5].includes(i)) return { day: d, focus: "Cardio (Zone 2) 25–35min" };
      return { day: d, focus: "Rest / Mobility 10–15min" };
    }
    const full = baseExercises(exp).map(e => {
      const swap = subForInjury(e.name, injuries);
      return { ...e, name: swap.name, rationale: swap.rationale };
    });
    const focus = i % 2 === 0 ? "Upper" : "Lower";
    return { day: d, focus, exercises: full };
  });

  const kcal = kcalFrom(p);
  const macros = macrosFrom(p, kcal);

  const nutrition = {
    kcal,
    ...macros,
    rationale:
      p?.diet === "vegan"
        ? "Protein set to ~2.2g/kg for plant-based completeness."
        : "Protein set to ~2.0g/kg; carbs/fat split 55/45 for adherence.",
  };

  const raw = JSON.stringify({
    userId,
    exp,
    injuries: [...injuries].sort(),
    goals: p?.goals,
    diet: p?.diet,
    weight: p?.bodyWeightKg,
    days,
    nutrition,
  });

  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { user: (p as any).user, trainingWeek: days, nutrition, hash } as IPlanPreview;
}


