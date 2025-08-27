import { Schema, model, Types } from "mongoose";

export interface PreviewExercise {
  name: string;
  sets: number;
  reps: string;
  rpe?: string;
  rationale?: string;
}

export interface PreviewDay {
  day: string;
  focus: string;
  exercises?: PreviewExercise[];
}

export interface NutritionSummary {
  kcal: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  rationale?: string;
}

export interface PlanPreview {
  user: Types.ObjectId;
  trainingWeek: PreviewDay[];
  nutrition: NutritionSummary;
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlanPreviewSchema = new Schema<PlanPreview>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true, unique: true },
    trainingWeek: [
      {
        day: String,
        focus: String,
        exercises: [
          {
            name: String,
            sets: Number,
            reps: String,
            rpe: String,
            rationale: String,
          },
        ],
      },
    ],
    nutrition: {
      kcal: Number,
      proteinGrams: Number,
      carbsGrams: Number,
      fatGrams: Number,
      rationale: String,
    },
    hash: { type: String, index: true },
  },
  { timestamps: true }
);

export default model<PlanPreview>("PlanPreview", PlanPreviewSchema);


