import { Schema, model, Types } from "mongoose";

export interface ChangeEvent {
  user: Types.ObjectId;
  type: "PLAN_EDIT" | "NUTRITION_EDIT" | "WEIGHT_LOG" | "WORKOUT_LOG";
  summary: string; rationale?: string;
  refId?: Types.ObjectId;
  actor?: Types.ObjectId | string;
  before?: any;
  after?: any;
  createdAt: Date; updatedAt: Date;
}

const ChangeEventSchema = new Schema<ChangeEvent>({
  user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
  type: { type: String, enum: ["PLAN_EDIT","NUTRITION_EDIT","WEIGHT_LOG","WORKOUT_LOG"], required: true },
  summary: { type: String, required: true },
  rationale: String,
  refId: { type: Schema.Types.ObjectId },
  actor: { type: Schema.Types.Mixed },
  before: { type: Schema.Types.Mixed },
  after: { type: Schema.Types.Mixed }
}, { timestamps: true });

ChangeEventSchema.index({ user: 1, createdAt: -1 });

export default (model as any).ChangeEvent || model<ChangeEvent>("ChangeEvent", ChangeEventSchema);


