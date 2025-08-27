import { Schema, model, Types } from "mongoose";

export interface StudentState {
  user: Types.ObjectId;
  currentTrainingPlanVersion?: Types.ObjectId;
  currentNutritionPlanVersion?: Types.ObjectId;
  snapshotUpdatedAt?: Date;
  lastEventAt?: Date;
  createdAt: Date; updatedAt: Date;
}

const StudentStateSchema = new Schema<StudentState>({
  user: { type: Schema.Types.ObjectId, ref: "User", unique: true, index: true, required: true },
  currentTrainingPlanVersion: { type: Schema.Types.ObjectId, ref: "TrainingPlanVersion" },
  currentNutritionPlanVersion: { type: Schema.Types.ObjectId, ref: "NutritionPlanVersion" },
  snapshotUpdatedAt: Date,
  lastEventAt: Date,
}, { timestamps: true });

export default model<StudentState>("StudentState", StudentStateSchema);


