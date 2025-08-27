export const MAX_SET_JUMP_PCT = 0.2;     // ≤20% volume increase per patch
export const MAX_LOAD_JUMP_PCT = 0.075;  // ≤7.5% via RPE/rep (heuristic)
export const MIN_KCAL = 1200, MAX_KCAL = 5000;

export function clampKcal(k: number) {
  return Math.max(MIN_KCAL, Math.min(MAX_KCAL, Math.round(k)));
}


