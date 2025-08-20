import { Schema, Types } from 'mongoose';

export interface INutritionDay {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface INutritionPlan {
  userId: Types.ObjectId;
  version: number;
  isCurrent: boolean;
  dailyTargets: INutritionDay;
  notes?: string;
  sourceText?: string;
  meals?: { name: string; items: string[] }[];
  guidelines?: string[];
  days?: { label: string; meals: { name: string; items: string[] }[] }[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const NutritionPlanSchema = new Schema<INutritionPlan>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  version: { type: Number, required: true },
  isCurrent: { type: Boolean, default: true },
  dailyTargets: { kcal: Number, protein: Number, carbs: Number, fat: Number },
  notes: String,
  sourceText: String,
  meals: [{ name: String, items: [String] }],
  guidelines: { type: [String], default: [] },
  days: [{ label: String, meals: [{ name: String, items: [String] }] }],
}, { timestamps: true });

NutritionPlanSchema.index({ userId: 1, version: -1 });


