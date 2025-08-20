import { Schema, Types } from 'mongoose';

export interface ITrainingSession {
  day: string; // e.g., Mon/Tue or YYYY-MM-DD
  focus: string; // e.g., Push / Pull / Legs
  exercises: { name: string; sets: number; reps: number; load?: number }[];
}

export interface ITrainingPlan {
  userId: Types.ObjectId;
  version: number;
  isCurrent: boolean;
  sessions: ITrainingSession[];
  sourceText?: string;
  guidelines?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const TrainingPlanSchema = new Schema<ITrainingPlan>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  version: { type: Number, required: true },
  isCurrent: { type: Boolean, default: true },
  sessions: [
    {
      day: String,
      focus: String,
      exercises: [
        { name: String, sets: Number, reps: Number, load: Number }
      ],
    },
  ],
  sourceText: { type: String },
  guidelines: { type: [String], default: [] },
}, { timestamps: true });

TrainingPlanSchema.index({ userId: 1, version: -1 });


