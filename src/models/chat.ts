import mongoose, { Schema, Types } from 'mongoose';

export interface IChatThread {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  lastMessageAt: Date;
  lastMessageText?: string;
  unread: Map<string, number>;
  isPaused: boolean;
  safetyStatus: "green" | "yellow" | "red";
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatMessage {
  _id: Types.ObjectId;
  thread: Types.ObjectId;
  sender: Types.ObjectId;
  text: string;
  flag: "green" | "yellow" | "red";
  clientId?: string | null;
  createdAt: Date;
  readBy: Types.ObjectId[];
}

const ChatThreadSchema = new Schema<IChatThread>(
  {
    participants: { type: [Schema.Types.ObjectId], ref: 'User', index: true, required: true },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessageText: String,
    unread: { type: Map, of: Number, default: {} },
    isPaused: { type: Boolean, default: false },
    safetyStatus: { type: String, enum: ["green", "yellow", "red"], default: "green" },
  },
  { timestamps: true }
);

ChatThreadSchema.index({ participants: 1 }, { unique: false });

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    thread: { type: Schema.Types.ObjectId, ref: 'ChatThread', index: true, required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    text: { type: String, required: true },
    flag: { type: String, enum: ["green", "yellow", "red"], default: "green" },
    // Optional client-provided id for optimistic UI dedupe.
    clientId: { type: String, required: false, index: true, default: null },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ChatThread = (mongoose.models.ChatThread as mongoose.Model<IChatThread>) || mongoose.model<IChatThread>('ChatThread', ChatThreadSchema);
export const ChatMessage = (mongoose.models.ChatMessage as mongoose.Model<IChatMessage>) || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);


