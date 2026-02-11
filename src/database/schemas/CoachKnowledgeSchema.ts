import { Schema, Types } from 'mongoose';

export interface ICoachKnowledge {
  userId: Types.ObjectId;
  title: string;
  content: string;
  type?: 'text' | 'pdf' | 'docx' | 'txt';
  mentorName?: string;
  embedding: number[];
  // Smart Ingestion Pipeline fields
  summary?: string;
  classification?: 'system_prompt' | 'rag';
  keywords?: string[];
  coreRules?: string[];
  entities?: string[];
  createdAt?: Date;
}

export const CoachKnowledgeSchema = new Schema<ICoachKnowledge>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'pdf', 'docx', 'txt'], default: 'text' },
  mentorName: { type: String, required: false },
  embedding: {
    type: [Number],
    required: true,
    select: false,
  },
  // Smart Ingestion Pipeline fields
  summary: { type: String, default: null },
  classification: {
    type: String,
    enum: ['system_prompt', 'rag'],
    default: 'rag',
  },
  keywords: { type: [String], default: [] },
  coreRules: { type: [String], default: [] },
  entities: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

CoachKnowledgeSchema.index({ userId: 1, createdAt: -1 });
CoachKnowledgeSchema.index({ userId: 1, classification: 1 });
CoachKnowledgeSchema.index({ keywords: 1 });



