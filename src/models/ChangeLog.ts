import { Schema, model, Types } from "mongoose";

export interface ChangeLog {
  user: Types.ObjectId;
  type: "PLAN_EDIT" | "NUTRITION_EDIT" | "WEIGHT_LOG" | "WORKOUT_LOG";
  summary: string; rationale?: string;
  refId?: Types.ObjectId;
  createdAt: Date; updatedAt: Date;
}

const ChangeLogSchema = new Schema<ChangeLog>({
  user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  type: { type: String, enum: ["PLAN_EDIT","NUTRITION_EDIT","WEIGHT_LOG","WORKOUT_LOG"], required: true },
  summary: { type: String, required: true },
  rationale: String,
  refId: { type: Schema.Types.ObjectId }
}, { timestamps: true });

ChangeLogSchema.index({ user: 1, createdAt: -1 });

export default model<ChangeLog>("ChangeLog", ChangeLogSchema);


