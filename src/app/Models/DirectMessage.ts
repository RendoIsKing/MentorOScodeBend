import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDirectMessage extends Document {
  roomId: Types.ObjectId;
  senderId: Types.ObjectId;
  text: string;
  flag: "green" | "yellow" | "red";
  flaggedCategories?: string[];
  createdAt: Date;
}

const DirectMessageSchema = new Schema<IDirectMessage>({
  roomId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, trim: true, default: '' },
  flag: { type: String, enum: ["green", "yellow", "red"], default: "green" },
  flaggedCategories: { type: [String], required: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

export const DirectMessage = mongoose.model<IDirectMessage>('DirectMessage', DirectMessageSchema);


