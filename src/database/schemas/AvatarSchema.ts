import { Schema, Types } from 'mongoose';

export interface IAvatar {
  userId: Types.ObjectId;
  personalityTraits?: string[];
  currentMood?: string;
  systemPrompt?: string;
  knowledgeBaseReferences?: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

export const AvatarSchema = new Schema<IAvatar>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
  personalityTraits: [{ type: String }],
  currentMood: String,
  systemPrompt: String,
  knowledgeBaseReferences: [{ type: Schema.Types.ObjectId, ref: 'CoachKnowledge' }],
}, { timestamps: true });

