import { Types } from "mongoose";
import { rebuildSnapshot } from "../snapshot/rebuildSnapshot";
import { onWeightLogged, onWorkoutLogged, onPlanUpdated } from "../snapshot/incremental";
import StudentState from "../../models/StudentState";

type DomainEvent =
  | { type: "PLAN_UPDATED"; user: Types.ObjectId }
  | { type: "NUTRITION_UPDATED"; user: Types.ObjectId }
  | { type: "WEIGHT_LOGGED"; user: Types.ObjectId; date?: string; kg?: number }
  | { type: "WORKOUT_LOGGED"; user: Types.ObjectId; date?: string };

export async function publish(event: DomainEvent) {
  try {
    await StudentState.updateOne({ user: event.user }, { $set: { lastEventAt: new Date() } }, { upsert: true });
  } catch {}
  switch (event.type) {
    case "PLAN_UPDATED":
      await onPlanUpdated(event.user);
      break;
    case "NUTRITION_UPDATED":
      await onPlanUpdated(event.user);
      break;
    case "WEIGHT_LOGGED":
      if (event.date && event.kg != null) await onWeightLogged(event.user, event.date, event.kg);
      break;
    case "WORKOUT_LOGGED":
      if (event.date) await onWorkoutLogged(event.user, event.date);
      break;
  }
  // Optionally also do full rebuild for robustness in dev
  // await rebuildSnapshot(event.user);
}


