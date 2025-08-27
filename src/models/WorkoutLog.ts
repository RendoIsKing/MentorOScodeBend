import { Schema, model, Types } from "mongoose";

export interface WorkoutLog {
  user: Types.ObjectId; date: string;
  entries: { name: string; sets: number; reps: number; loadKg?: number }[];
  createdAt: Date; updatedAt: Date;
}

const WorkoutLogSchema = new Schema<WorkoutLog>({
  user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  date: { type: String, index: true, required: true },
  entries: [{ name: String, sets: Number, reps: Number, loadKg: Number }]
}, { timestamps: true });

WorkoutLogSchema.index({ user: 1, date: 1 }, { unique: true });

export default model<WorkoutLog>("WorkoutLog", WorkoutLogSchema);


