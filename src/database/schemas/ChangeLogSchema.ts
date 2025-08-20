import { Schema, Types } from 'mongoose';

export interface IChangeLog {
  userId: Types.ObjectId;
  area: 'training' | 'nutrition' | 'goal';
  summary: string;
  reason?: string;
  fromVersion?: number;
  toVersion?: number;
  createdAt?: Date;
}

export const ChangeLogSchema = new Schema<IChangeLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  area: { type: String, enum: ['training','nutrition','goal'], required: true },
  summary: String,
  reason: String,
  fromVersion: Number,
  toVersion: Number,
}, { timestamps: { createdAt: true, updatedAt: false } });

ChangeLogSchema.index({ userId: 1, createdAt: -1 });


