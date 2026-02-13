import {
  onWeightLogged,
  onWorkoutLogged,
  onPlanUpdated,
  onWeightDeleted,
} from "../snapshot/incremental";
import { upsert, Tables } from "../../lib/db";

type DomainEvent =
  | { type: "PLAN_UPDATED"; user: string }
  | { type: "NUTRITION_UPDATED"; user: string }
  | { type: "WEIGHT_LOGGED"; user: string; date?: string; kg?: number }
  | { type: "WORKOUT_LOGGED"; user: string; date?: string }
  | { type: "WEIGHT_DELETED"; user: string; date: string }
  | { type: "GOAL_UPDATED"; user: string };

export async function publish(event: DomainEvent) {
  try {
    await upsert(
      Tables.STUDENT_STATES,
      {
        user_id: event.user,
        last_event_at: new Date().toISOString(),
      },
      "user_id"
    );
  } catch {}

  switch (event.type) {
    case "PLAN_UPDATED":
      await onPlanUpdated(event.user);
      break;
    case "NUTRITION_UPDATED":
      await onPlanUpdated(event.user);
      break;
    case "WEIGHT_LOGGED":
      if (event.date && event.kg != null)
        await onWeightLogged(event.user, event.date, event.kg);
      break;
    case "WEIGHT_DELETED":
      if (event.date) await onWeightDeleted(event.user, event.date);
      break;
    case "WORKOUT_LOGGED":
      if (event.date) await onWorkoutLogged(event.user, event.date);
      break;
    case "GOAL_UPDATED":
      await onPlanUpdated(event.user);
      break;
  }
}
