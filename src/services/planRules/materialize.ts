import { insertOne, upsert, Tables } from "../../lib/db";
import { publish } from "../events/publish";
import {
  nextTrainingVersion,
  nextNutritionVersion,
} from "../versioning/nextVersion";
import { TrainingPatch, NutritionPatch } from "./types";

export async function applyTrainingPatch(
  userId: string,
  current: any,
  patch: TrainingPatch
) {
  let days = [...(current?.days || [])];

  patch.swaps?.forEach((s: any) => {
    days = days.map((d: any) =>
      d.day !== s.day
        ? d
        : {
            ...d,
            exercises: (d.exercises || []).map((e: any) =>
              e.name === s.from ? { ...e, name: s.to } : e
            ),
          }
    );
  });

  patch.volumeTweaks?.forEach((t: any) => {
    days = days.map((d: any) =>
      d.day !== t.day
        ? d
        : {
            ...d,
            exercises: (d.exercises || []).map((e: any) =>
              e.name !== t.name
                ? e
                : { ...e, sets: Math.max(1, (e.sets || 3) + (t.deltaSets || 0)) }
            ),
          }
    );
  });

  patch.intensityTweaks?.forEach((t: any) => {
    days = days.map((d: any) =>
      d.day !== t.day
        ? d
        : {
            ...d,
            exercises: (d.exercises || []).map((e: any) =>
              e.name !== t.name
                ? e
                : { ...e, rpe: t.newRpe || e.rpe }
            ),
          }
    );
  });

  const version = await nextTrainingVersion(userId);
  const reason =
    patch.reason.summary +
    (patch.reason.bullets?.length
      ? " — " + patch.reason.bullets.join("; ")
      : "");

  const doc = await insertOne(Tables.TRAINING_PLAN_VERSIONS, {
    user_id: userId,
    version,
    source: "action",
    reason,
    days,
  });

  await upsert(
    Tables.STUDENT_STATES,
    {
      user_id: userId,
      current_training_plan_version_id: doc.id,
    },
    "user_id"
  );

  try {
    await insertOne(Tables.CHANGE_EVENTS, {
      user_id: userId,
      type: "PLAN_EDIT",
      summary: reason,
      ref_id: doc.id,
    });
  } catch {}

  await publish({ type: "PLAN_UPDATED", user: userId });
  return { version, id: doc.id };
}

export async function applyNutritionPatch(
  userId: string,
  patch: NutritionPatch
) {
  const version = await nextNutritionVersion(userId);
  const reason =
    patch.reason.summary +
    (patch.reason.bullets?.length
      ? " — " + patch.reason.bullets.join("; ")
      : "");

  const doc = await insertOne(Tables.NUTRITION_PLAN_VERSIONS, {
    user_id: userId,
    version,
    source: "action",
    reason,
    kcal: patch.kcal,
    protein_grams: patch.proteinGrams,
    carbs_grams: patch.carbsGrams,
    fat_grams: patch.fatGrams,
  });

  await upsert(
    Tables.STUDENT_STATES,
    {
      user_id: userId,
      current_nutrition_plan_version_id: doc.id,
    },
    "user_id"
  );

  try {
    await insertOne(Tables.CHANGE_EVENTS, {
      user_id: userId,
      type: "NUTRITION_EDIT",
      summary: reason,
      ref_id: doc.id,
    });
  } catch {}

  await publish({ type: "NUTRITION_UPDATED", user: userId });
  return { version, id: doc.id };
}
