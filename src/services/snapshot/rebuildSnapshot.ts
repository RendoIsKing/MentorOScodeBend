import StudentSnapshot from "../../models/StudentSnapshot";
import StudentState from "../../models/StudentState";
import TrainingPlanVersion from "../../models/TrainingPlanVersion";
import NutritionPlanVersion from "../../models/NutritionPlanVersion";
import { WeightEntry } from "../../app/Models/WeightEntry";
import { Types } from "mongoose";

export async function rebuildSnapshot(user: Types.ObjectId) {
  const state = await StudentState.findOne({ user });
  const [tp, np] = await Promise.all([
    state?.currentTrainingPlanVersion ? TrainingPlanVersion.findById(state.currentTrainingPlanVersion) : null,
    state?.currentNutritionPlanVersion ? NutritionPlanVersion.findById(state.currentNutritionPlanVersion) : null
  ]);

  const weights = await WeightEntry.find({ userId: user as any }).sort({ date: 1 }).select('date kg').lean();
  const weightSeries = (weights || []).map((w: any) => ({ t: w.date, v: w.kg }));

  const daysPerWeek = tp ? (tp.days || []).filter((d: any) => (d.exercises || []).length).length : 0;

  const snap: any = {
    user,
    weightSeries,
    trainingPlanSummary: tp ? { daysPerWeek } : undefined,
    nutritionSummary: np ? { kcal: np.kcal, protein: np.proteinGrams, carbs: np.carbsGrams, fat: np.fatGrams } : undefined,
    kpis: { adherence7d: 0 }
  };

  await StudentSnapshot.findOneAndUpdate({ user }, { $set: snap }, { upsert: true });
  await StudentState.updateOne({ user }, { $set: { snapshotUpdatedAt: new Date() } }, { upsert: true });
}


