import { z } from 'zod';

export const chatMessageSchema = z.object({
  text: z.string().trim().min(1, 'message required').max(1000, 'message too long'),
});

export const WeightLogSchema = z.object({
  date: z.string().min(6),
  kg: z.number().positive().max(400),
});

export const WeightDeleteSchema = z.object({
  date: z.string().min(6),
});

export const NutritionCaloriesSchema = z.object({
  kcal: z.number().int(),
});

export const DaysPerWeekSchema = z.object({
  daysPerWeek: z.number().int().min(1).max(7),
});

export const SwapExerciseSchema = z.object({
  day: z.enum(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).optional(),
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

export const ActionSchema = z.object({
  type: z.enum(['PLAN_SWAP_EXERCISE','PLAN_SET_DAYS_PER_WEEK','NUTRITION_SET_CALORIES','WEIGHT_LOG','WEIGHT_DELETE']),
  payload: z.union([
    SwapExerciseSchema,
    DaysPerWeekSchema,
    NutritionCaloriesSchema,
    WeightLogSchema,
    WeightDeleteSchema,
    z.record(z.any()).optional(),
  ]).optional(),
});

export type ActionBody = z.infer<typeof ActionSchema> & { userId?: string };


