import { NutritionPatch } from "./types";
import { clampKcal } from "./safety";

export function nutritionFromProfile(profile: any): NutritionPatch {
  const goal = profile?.goals ?? "maintain";
  const bw = profile?.bodyWeightKg ?? 70;
  const vegan = profile?.diet === "vegan";

  const kcalMult = goal === "cut" ? 28 : goal === "gain" ? 33 : 30;
  const kcal = clampKcal(bw * kcalMult);
  const proteinPerKg = vegan ? 2.2 : 2.0;
  const proteinGrams = Math.round(bw * proteinPerKg);
  const carbsGrams = Math.round(((kcal - proteinGrams * 4) * 0.55) / 4);
  const fatGrams = Math.round(((kcal - proteinGrams * 4) * 0.45) / 9);

  return {
    kcal, proteinGrams, carbsGrams, fatGrams,
    reason: {
      summary: "Makroer fra profil",
      bullets: [
        `${goal} mål → ${kcalMult} kcal/kg`,
        vegan ? "Protein ~2.2 g/kg (plantekilder)" : "Protein ~2.0 g/kg",
        "55/45 fordeling karb/fett for etterlevelse",
      ]
    }
  };
}


