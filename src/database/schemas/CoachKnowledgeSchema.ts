import { Schema, Types } from 'mongoose';

export interface ICoachKnowledge {
  coachId: Types.ObjectId; // e.g., userId of the mentor/coach
  title?: string;
  text?: string; // free-form training text
  filePath?: string; // uploaded file path
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const CoachKnowledgeSchema = new Schema<ICoachKnowledge>({
  coachId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String },
  text: { type: String },
  filePath: { type: String },
  mimeType: { type: String },
  sizeBytes: { type: Number },
}, { timestamps: true });

CoachKnowledgeSchema.index({ coachId: 1, createdAt: -1 });



