import { Schema, model, Types } from "mongoose";

export interface NutritionPlanVersion {
  user: Types.ObjectId;
  version: number;
  source: "preview" | "rule" | "manual" | "action";
  reason?: string;
  kcal: number;
  proteinGrams: number; carbsGrams: number; fatGrams: number;
  createdAt: Date; updatedAt: Date;
}

const NutritionPlanVersionSchema = new Schema<NutritionPlanVersion>({
  user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  version: { type: Number, index: true, required: true },
  source: { type: String, enum: ["preview", "rule", "manual", "action"], default: "action" },
  reason: String,
  kcal: Number, proteinGrams: Number, carbsGrams: Number, fatGrams: Number,
}, { timestamps: true });

NutritionPlanVersionSchema.index({ user: 1, version: -1 }, { unique: true });

export default model<NutritionPlanVersion>("NutritionPlanVersion", NutritionPlanVersionSchema);


