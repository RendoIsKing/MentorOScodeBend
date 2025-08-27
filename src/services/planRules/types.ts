export type PatchReason = {
  summary: string;
  bullets?: string[];
};

export type TrainingPatch = {
  targetDaysPerWeek?: number;
  swaps?: { day: string; from: string; to: string }[];
  volumeTweaks?: { day: string; name: string; deltaSets?: number; deltaReps?: number }[];
  intensityTweaks?: { day: string; name: string; newRpe?: string }[];
  deload?: boolean;
  reason: PatchReason;
};

export type NutritionPatch = {
  kcal?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  reason: PatchReason;
};


