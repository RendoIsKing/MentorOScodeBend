import { Schema, Types } from 'mongoose';

export interface IUserProfile {
  userId: Types.ObjectId;
  goals?: string;
  currentWeightKg?: number;
  strengths?: string;
  weaknesses?: string;
  injuryHistory?: string;
  nutritionPreferences?: string;
  trainingDaysPerWeek?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const UserProfileSchema = new Schema<IUserProfile>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
  goals: String,
  currentWeightKg: Number,
  strengths: String,
  weaknesses: String,
  injuryHistory: String,
  nutritionPreferences: String,
  trainingDaysPerWeek: Number,
}, { timestamps: true });


