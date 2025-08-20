import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { UserProfile } from '../../Models/UserProfile';
import { TrainingPlan, NutritionPlan, Goal, ChangeLog } from '../../Models/PlanModels';

export const generateFirstPlans = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || req.body.userId;
    if (!userId || !Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'userId required' });
    }

    const profile = await UserProfile.findOne({ userId: new Types.ObjectId(userId) }).lean();
    if (!profile) return res.status(400).json({ message: 'profile not found' });

    // Compute defaults based on profile
    const days = profile.trainingDaysPerWeek || 3;
    const sessions = Array.from({ length: days }).map((_, i) => ({
      day: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i % 7],
      focus: ['Push','Pull','Legs'][i % 3],
      exercises: [
        { name: 'Squat', sets: 4, reps: 6 },
        { name: 'Bench Press', sets: 4, reps: 6 },
        { name: 'Row', sets: 4, reps: 8 },
      ],
    }));

    const latestTraining = await TrainingPlan.findOne({ userId }).sort({ version: -1 });
    const nextVersion = (latestTraining?.version || 0) + 1;

    await TrainingPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
    const training = await TrainingPlan.create({ userId, version: nextVersion, isCurrent: true, sessions });

    // Nutrition
    const weight = profile.currentWeightKg || 80;
    const kcal = Math.round(weight * 30); // naive TDEE estimate
    const protein = Math.round(weight * 2.0);
    const carbs = Math.round((kcal * 0.5) / 4);
    const fat = Math.round((kcal * 0.25) / 9);

    const latestNut = await NutritionPlan.findOne({ userId }).sort({ version: -1 });
    const nextNutVersion = (latestNut?.version || 0) + 1;
    await NutritionPlan.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
    const nutrition = await NutritionPlan.create({ userId, version: nextNutVersion, isCurrent: true, dailyTargets: { kcal, protein, carbs, fat }, notes: profile.nutritionPreferences || '' });

    // Goals
    const latestGoal = await Goal.findOne({ userId }).sort({ version: -1 });
    const nextGoalVersion = (latestGoal?.version || 0) + 1;
    await Goal.updateMany({ userId, isCurrent: true }, { $set: { isCurrent: false } });
    const goal = await Goal.create({ userId, version: nextGoalVersion, isCurrent: true, targetWeightKg: Math.max(0, weight - 5), strengthTargets: 'Squat +10kg, Bench +5kg', horizonWeeks: 8 });

    await ChangeLog.create({ userId, area: 'training', summary: 'Initial training plan created', toVersion: training.version });
    await ChangeLog.create({ userId, area: 'nutrition', summary: 'Initial nutrition plan created', toVersion: nutrition.version });
    await ChangeLog.create({ userId, area: 'goal', summary: 'Initial goals set', toVersion: goal.version });

    return res.json({
      training,
      nutrition,
      goal,
      message: 'Planer generert og lagt til Assets.',
      actions: [
        { type: 'PLAN_CREATE', area: 'training', planId: String(training._id) },
        { type: 'PLAN_CREATE', area: 'nutrition', planId: String(nutrition._id) },
        { type: 'GOAL_SET', goalId: String(goal._id) }
      ]
    });
  } catch (e) {
    console.error('generateFirstPlans error', e);
    return res.status(500).json({ message: 'failed to generate first plans' });
  }
};


