import { Schema, model, Types } from "mongoose";

export interface TrainingDay {
  day: string; focus: string;
  exercises: { name: string; sets: number; reps: string; rpe?: string }[];
}

export interface TrainingPlanVersion {
  user: Types.ObjectId;
  version: number;
  source: "preview" | "rule" | "manual" | "action";
  reason?: string;
  days: TrainingDay[];
  createdAt: Date; updatedAt: Date;
}

const TrainingPlanVersionSchema = new Schema<TrainingPlanVersion>({
  user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  version: { type: Number, index: true, required: true },
  source: { type: String, enum: ["preview", "rule", "manual", "action"], default: "action" },
  reason: String,
  days: [{
    day: String,
    focus: String,
    exercises: [{ name: String, sets: Number, reps: String, rpe: String }]
  }]
}, { timestamps: true });

TrainingPlanVersionSchema.index({ user: 1, version: -1 }, { unique: true });

export default model<TrainingPlanVersion>("TrainingPlanVersion", TrainingPlanVersionSchema);


