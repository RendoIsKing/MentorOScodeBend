import { model, Model } from 'mongoose';
import { TrainingPlanSchema, ITrainingPlan } from '../../database/schemas/TrainingPlanSchema';
import { NutritionPlanSchema, INutritionPlan } from '../../database/schemas/NutritionPlanSchema';
import { GoalSchema, IGoal } from '../../database/schemas/GoalSchema';
import { ChangeLogSchema, IChangeLog } from '../../database/schemas/ChangeLogSchema';

const TrainingPlan: Model<ITrainingPlan> = model<ITrainingPlan>('TrainingPlan', TrainingPlanSchema);
const NutritionPlan: Model<INutritionPlan> = model<INutritionPlan>('NutritionPlan', NutritionPlanSchema);
const Goal: Model<IGoal> = model<IGoal>('Goal', GoalSchema);
const ChangeLog: Model<IChangeLog> = model<IChangeLog>('ChangeLog', ChangeLogSchema);

export { TrainingPlan, NutritionPlan, Goal, ChangeLog };


