import { Schema, Types } from 'mongoose';

export interface IChatMessage {
  threadId: Types.ObjectId;
  sender: 'user' | 'assistant';
  text: string;
  createdAt?: Date;
}

export const ChatMessageSchema = new Schema<IChatMessage>({
  threadId: { type: Schema.Types.ObjectId, ref: 'ChatThread', required: true, index: true },
  sender: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

ChatMessageSchema.index({ threadId: 1, createdAt: -1 });


