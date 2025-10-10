import TrainingPlanVersion from "../../models/TrainingPlanVersion";
import NutritionPlanVersion from "../../models/NutritionPlanVersion";
import StudentState from "../../models/StudentState";
import ChangeEvent from "../../models/ChangeEvent";
import { publish } from "../events/publish";
import { nextTrainingVersion, nextNutritionVersion } from "../versioning/nextVersion";
import { TrainingPatch, NutritionPatch } from "./types";

export async function applyTrainingPatch(user: any, current: any, patch: TrainingPatch) {
  let days = [...(current?.days || [])];

  patch.swaps?.forEach((s: any) => {
    days = days.map((d: any) => d.day !== s.day ? d : ({
      ...d, exercises: (d.exercises||[]).map((e: any) => e.name === s.from ? { ...e, name: s.to } : e)
    }));
  });

  patch.volumeTweaks?.forEach((t: any) => {
    days = days.map((d: any) => d.day !== t.day ? d : ({
      ...d, exercises: (d.exercises||[]).map((e: any) => e.name !== t.name ? e : { ...e, sets: Math.max(1, (e.sets||3) + (t.deltaSets||0)) })
    }));
  });

  patch.intensityTweaks?.forEach((t: any) => {
    days = days.map((d: any) => d.day !== t.day ? d : ({
      ...d, exercises: (d.exercises||[]).map((e: any) => e.name !== t.name ? e : { ...e, rpe: t.newRpe || e.rpe })
    }));
  });

  const version = await nextTrainingVersion(user);
  const reason = patch.reason.summary + (patch.reason.bullets?.length ? " — " + patch.reason.bullets.join("; ") : "");
  const doc = await TrainingPlanVersion.create({ user, version, source: "action", reason, days });
  await StudentState.findOneAndUpdate({ user }, { $set: { currentTrainingPlanVersion: doc._id } }, { upsert: true });
  try { await ChangeEvent.create({ user, type: "PLAN_EDIT", summary: reason, refId: doc._id }); } catch {}
  await publish({ type: "PLAN_UPDATED", user });
  return { version, id: doc._id };
}

export async function applyNutritionPatch(user: any, patch: NutritionPatch) {
  const version = await nextNutritionVersion(user);
  const reason = patch.reason.summary + (patch.reason.bullets?.length ? " — " + patch.reason.bullets.join("; ") : "");
  const doc = await NutritionPlanVersion.create({
    user, version, source: "action", reason,
    kcal: patch.kcal, proteinGrams: patch.proteinGrams, carbsGrams: patch.carbsGrams, fatGrams: patch.fatGrams
  });
  await StudentState.findOneAndUpdate({ user }, { $set: { currentNutritionPlanVersion: doc._id } }, { upsert: true });
  try { await ChangeEvent.create({ user, type: "NUTRITION_EDIT", summary: reason, refId: doc._id }); } catch {}
  await publish({ type: "NUTRITION_UPDATED", user });
  return { version, id: doc._id };
}


