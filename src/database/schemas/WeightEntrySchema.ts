import { Schema, Types } from 'mongoose';

export interface IWeightEntry {
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  kg: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const WeightEntrySchema = new Schema<IWeightEntry>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: String, required: true },
  kg: { type: Number, required: true },
}, { timestamps: true });

WeightEntrySchema.index({ userId: 1, date: 1 }, { unique: true });
WeightEntrySchema.index({ userId: 1, date: 1, kg: 1 });


