import { Schema, Types } from 'mongoose';

export interface IChatThread {
  userId: Types.ObjectId;
  partner: string; // 'coach-engh'
  createdAt?: Date;
  updatedAt?: Date;
}

export const ChatThreadSchema = new Schema<IChatThread>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  partner: { type: String, required: true },
}, { timestamps: true });

ChatThreadSchema.index({ userId: 1, partner: 1 }, { unique: true });


