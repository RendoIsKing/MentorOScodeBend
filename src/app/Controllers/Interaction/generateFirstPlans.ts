import { Request, Response } from 'express';
import { db, findOne, insertOne, updateMany, Tables } from '../../../lib/db';

export const generateFirstPlans = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id || req.body.userId;
    if (!userId) {
      return res.status(400).json({ message: 'userId required' });
    }

    const profile = await findOne(Tables.USER_PROFILES, { user_id: userId });
    if (!profile) return res.status(400).json({ message: 'profile not found' });

    // Compute defaults based on profile
    const days = profile.training_days_per_week ?? 3;
    const sessions = Array.from({ length: days }).map((_, i) => ({
      day: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i % 7],
      focus: ['Push','Pull','Legs'][i % 3],
      exercises: [
        { name: 'Squat', sets: 4, reps: 6 },
        { name: 'Bench Press', sets: 4, reps: 6 },
        { name: 'Row', sets: 4, reps: 8 },
      ],
    }));

    const { data: latestTraining } = await db
      .from(Tables.TRAINING_PLANS)
      .select('version')
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latestTraining?.version ?? 0) + 1;

    await updateMany(Tables.TRAINING_PLANS, { user_id: userId, is_current: true }, { is_current: false });
    const training = await insertOne(Tables.TRAINING_PLANS, { user_id: userId, version: nextVersion, is_current: true, sessions });

    // Nutrition
    const weight = profile.current_weight_kg ?? 80;
    const kcal = Math.round(weight * 30);
    const protein = Math.round(weight * 2.0);
    const carbs = Math.round((kcal * 0.5) / 4);
    const fat = Math.round((kcal * 0.25) / 9);

    const { data: latestNut } = await db
      .from(Tables.NUTRITION_PLANS)
      .select('version')
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNutVersion = (latestNut?.version ?? 0) + 1;
    await updateMany(Tables.NUTRITION_PLANS, { user_id: userId, is_current: true }, { is_current: false });
    const nutrition = await insertOne(Tables.NUTRITION_PLANS, { user_id: userId, version: nextNutVersion, is_current: true, daily_targets: { kcal, protein, carbs, fat }, notes: profile.nutrition_preferences || '' });

    // Goals
    const { data: latestGoal } = await db
      .from(Tables.GOALS)
      .select('version')
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextGoalVersion = (latestGoal?.version ?? 0) + 1;
    await updateMany(Tables.GOALS, { user_id: userId, is_current: true }, { is_current: false });
    const goal = await insertOne(Tables.GOALS, { user_id: userId, version: nextGoalVersion, is_current: true, target_weight_kg: Math.max(0, weight - 5), strength_targets: 'Squat +10kg, Bench +5kg', horizon_weeks: 8 });

    await insertOne(Tables.CHANGE_LOGS, { user_id: userId, area: 'training', summary: 'Initial training plan created', to_version: nextVersion });
    await insertOne(Tables.CHANGE_LOGS, { user_id: userId, area: 'nutrition', summary: 'Initial nutrition plan created', to_version: nextNutVersion });
    await insertOne(Tables.CHANGE_LOGS, { user_id: userId, area: 'goal', summary: 'Initial goals set', to_version: nextGoalVersion });

    return res.json({
      training,
      nutrition,
      goal,
      message: 'Planer generert og lagt til Assets.',
      actions: [
        { type: 'PLAN_CREATE', area: 'training', planId: String(training?.id) },
        { type: 'PLAN_CREATE', area: 'nutrition', planId: String(nutrition?.id) },
        { type: 'GOAL_SET', goalId: String(goal?.id) }
      ]
    });
  } catch (e) {
    console.error('generateFirstPlans error', e);
    return res.status(500).json({ message: 'failed to generate first plans' });
  }
};
