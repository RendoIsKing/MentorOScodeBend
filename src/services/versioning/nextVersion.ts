import TrainingPlanVersion from "../../models/TrainingPlanVersion";
import NutritionPlanVersion from "../../models/NutritionPlanVersion";
import { Types } from "mongoose";

export async function nextTrainingVersion(user: Types.ObjectId) {
  const last = await TrainingPlanVersion.findOne({ user }).sort({ version: -1 });
  return (last?.version ?? 0) + 1;
}

export async function nextNutritionVersion(user: Types.ObjectId) {
  const last = await NutritionPlanVersion.findOne({ user }).sort({ version: -1 });
  return (last?.version ?? 0) + 1;
}


