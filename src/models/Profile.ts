import { Schema, model, Types } from "mongoose";

export type Injury =
  | "knee" | "shoulder" | "back" | "elbow" | "ankle" | "hip" | "none";

export interface Profile {
  user: Types.ObjectId;
  goals?: "cut" | "maintain" | "gain";
  experienceLevel?: "beginner" | "intermediate" | "advanced";
  bodyWeightKg?: number;
  diet?: "regular" | "vegan" | "vegetarian" | "keto" | "none";
  schedule?: { daysPerWeek?: number; preferredDays?: string[] };
  equipment?: ("gym" | "home" | "dumbbells" | "barbell" | "machines")[];
  injuries?: Injury[];
  preferences?: { hates?: string[]; likes?: string[] };
  consentFlags?: { healthData: boolean; timestamp?: Date };
  collectedPercent?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileSchema = new Schema<Profile>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true, unique: true },
    goals: { type: String, enum: ["cut", "maintain", "gain"] },
    experienceLevel: { type: String, enum: ["beginner", "intermediate", "advanced"] },
    bodyWeightKg: Number,
    diet: { type: String, enum: ["regular", "vegan", "vegetarian", "keto", "none"] },
    schedule: {
      daysPerWeek: Number,
      preferredDays: [String],
    },
    equipment: [String],
    injuries: [String],
    preferences: {
      hates: [String],
      likes: [String],
    },
    consentFlags: {
      healthData: { type: Boolean, default: false },
      timestamp: Date,
    },
    collectedPercent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default model<Profile>("Profile", ProfileSchema);


