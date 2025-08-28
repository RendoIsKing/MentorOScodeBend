import { TrainingPatch, PatchReason } from "./types";
import { MAX_SET_JUMP_PCT } from "./safety";

type Exercise = { name: string; sets: number; reps: string; rpe?: string };
type Day = { day: string; focus: string; exercises: Exercise[] };

const injurySwap: Record<string, Record<string,string>> = {
  knee: { "Back Squat": "Leg Press", "Lunge": "Step-ups" },
};

function nearestValidDay(requested: string, planDays: Day[]): string {
  const idx = planDays.findIndex(d => d.day === requested);
  if (idx >= 0) return requested;
  const cand = planDays.find(d => d.exercises?.length);
  return cand?.day ?? planDays[0]?.day ?? requested;
}

export function patchSetDaysPerWeek(current: Day[], daysPerWeek: number): TrainingPatch {
  const swaps: TrainingPatch["swaps"] = [];
  const reason: PatchReason = {
    summary: `Satt treningsfrekvens til ${daysPerWeek}/uke`,
    bullets: ["Beholdt eksisterende økter, ryddet øvrige dager til hvile/mobilitet"],
  };
  return { targetDaysPerWeek: daysPerWeek, swaps, reason };
}

export function patchSwapExercise(current: Day[], day: string, from: string, to: string): TrainingPatch {
  const targetDay = nearestValidDay(day, current);
  const reason: PatchReason = {
    summary: `Byttet ${from} → ${to} på ${targetDay}`,
    bullets: ["Skade-/preferansevennlig bytte", "Uten endring i totalvolum"],
  };
  return { swaps: [{ day: targetDay, from, to }], reason };
}

export function patchProgression(current: Day[]): TrainingPatch {
  const volumeTweaks = current
    .filter(d => d.exercises?.length)
    .map(d => {
      const main = d.exercises[0];
      const maxAdd = Math.max(1, Math.floor((main.sets || 3) * MAX_SET_JUMP_PCT));
      return { day: d.day, name: main.name, deltaSets: Math.min(1, maxAdd) };
    });

  const reason: PatchReason = { summary: "Liten, kontrollert progresjon", bullets: ["≤20% volumøkning på hovedløft"] };
  return { volumeTweaks, reason };
}

export function patchDeload(current: Day[]): TrainingPatch {
  const volumeTweaks: TrainingPatch["volumeTweaks"] = [];
  const intensityTweaks: TrainingPatch["intensityTweaks"] = [];

  current.forEach(d => d.exercises?.forEach(e => {
    const reduce = Math.max(1, Math.round((e.sets || 3) * 0.3));
    volumeTweaks.push({ day: d.day, name: e.name, deltaSets: -reduce });
    if (e.rpe) {
      const num = Number(String(e.rpe).replace(/[^\d]/g, "")) || 7;
      intensityTweaks.push({ day: d.day, name: e.name, newRpe: `RPE ${Math.max(5, num - 1)}` });
    }
  }));

  const reason: PatchReason = { summary: "Deload uke", bullets: ["~30% lavere volum", "RPE -1 for restitusjon"] };
  return { deload: true, volumeTweaks, intensityTweaks, reason };
}

export function applyInjurySubstitutions(days: Day[], injuries: string[]): TrainingPatch | null {
  const swaps: NonNullable<TrainingPatch["swaps"]> = [];
  if (!injuries?.length) return null;

  days.forEach(d => d.exercises?.forEach(e => {
    injuries.forEach(inj => {
      const map = injurySwap[inj];
      const to = map?.[e.name];
      if (to) swaps.push({ day: d.day, from: e.name, to });
    });
  }));

  if (!swaps.length) return null;
  return { swaps, reason: { summary: "Skadejustering", bullets: ["Byttet øvelser til mer skånsomme alternativer"] } };
}


