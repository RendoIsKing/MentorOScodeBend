import { Schema, Types } from 'mongoose';

export interface IGoal {
  userId: Types.ObjectId;
  version: number;
  isCurrent: boolean;
  targetWeightKg?: number;
  strengthTargets?: string; // free text for now
  horizonWeeks?: number;
  // Extended SMART-style metadata
  sourceText?: string;
  caloriesDailyDeficit?: number; // kcal/day
  weeklyWeightLossKg?: number; // kg per week
  weeklyExerciseMinutes?: number; // minutes per week
  hydrationLiters?: number; // liters per day
  plan?: {
    shortTerm?: string[];
    mediumTerm?: string[];
    longTerm?: string[];
    tips?: string[];
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export const GoalSchema = new Schema<IGoal>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  version: { type: Number, required: true },
  isCurrent: { type: Boolean, default: true },
  targetWeightKg: Number,
  strengthTargets: String,
  horizonWeeks: Number,
  sourceText: String,
  caloriesDailyDeficit: Number,
  weeklyWeightLossKg: Number,
  weeklyExerciseMinutes: Number,
  hydrationLiters: Number,
  plan: {
    shortTerm: [String],
    mediumTerm: [String],
    longTerm: [String],
    tips: [String],
  },
}, { timestamps: true });

GoalSchema.index({ userId: 1, version: -1 });


