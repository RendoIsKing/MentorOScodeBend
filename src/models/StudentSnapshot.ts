import { Schema, model, Types } from "mongoose";

export interface KPI {
  nextWorkout?: string;
  adherence7d?: number;
  lastCheckIn?: string;
}

export interface SnapshotSeriesPoint { t: string; v: number }

export interface StudentSnapshot {
  user: Types.ObjectId;
  weightSeries: SnapshotSeriesPoint[];
  trainingPlanSummary?: { daysPerWeek: number };
  nutritionSummary?: { kcal: number; protein: number; carbs: number; fat: number };
  kpis?: KPI;
  updatedAt: Date;
}

const StudentSnapshotSchema = new Schema<StudentSnapshot>({
  user: { type: Schema.Types.ObjectId, ref: "User", unique: true, index: true, required: true },
  weightSeries: [{ t: String, v: Number }],
  trainingPlanSummary: { daysPerWeek: Number },
  nutritionSummary: { kcal: Number, protein: Number, carbs: Number, fat: Number },
  kpis: { nextWorkout: String, adherence7d: Number, lastCheckIn: String },
}, { timestamps: { createdAt: false, updatedAt: 'updatedAt' } });

export default model<StudentSnapshot>("StudentSnapshot", StudentSnapshotSchema);


