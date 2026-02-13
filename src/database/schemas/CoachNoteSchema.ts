import mongoose, { Schema, Types } from "mongoose";

export interface ICoachNote {
  _id: Types.ObjectId;
  coachId: Types.ObjectId;   // The coach who wrote the note
  clientId: Types.ObjectId;  // The client the note is about
  text: string;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CoachNoteSchema = new Schema<ICoachNote>(
  {
    coachId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true, maxlength: 5000 },
    pinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for coach + client lookups
CoachNoteSchema.index({ coachId: 1, clientId: 1, createdAt: -1 });

export const CoachNote = mongoose.models.CoachNote || mongoose.model<ICoachNote>("CoachNote", CoachNoteSchema);
