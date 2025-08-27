import { Schema, model, Types } from 'mongoose';

export interface ExerciseProgressDoc {
  userId: Types.ObjectId;
  exercise: string; // slug or name
  date: string; // YYYY-MM-DD
  value: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const ExerciseProgressSchema = new Schema<ExerciseProgressDoc>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  exercise: { type: String, index: true, required: true },
  date: { type: String, index: true, required: true },
  value: { type: Number, required: true },
}, { timestamps: true });

ExerciseProgressSchema.index({ userId: 1, exercise: 1, date: 1 }, { unique: true });

export const ExerciseProgress = model<ExerciseProgressDoc>('ExerciseProgress', ExerciseProgressSchema);


