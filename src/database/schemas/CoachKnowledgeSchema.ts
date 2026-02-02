import { Schema, Types } from 'mongoose';

export interface ICoachKnowledge {
  userId: Types.ObjectId;
  title: string;
  content: string;
  type?: 'text' | 'pdf';
  mentorName?: string;
  embedding: number[];
  createdAt?: Date;
}

export const CoachKnowledgeSchema = new Schema<ICoachKnowledge>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'pdf'], default: 'text' },
  mentorName: { type: String, required: false },
  embedding: {
    type: [Number],
    required: true,
    select: false,
  },
  createdAt: { type: Date, default: Date.now },
});

CoachKnowledgeSchema.index({ userId: 1, createdAt: -1 });



