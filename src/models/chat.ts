import mongoose, { Schema, Types } from 'mongoose';

/* ──────────────────────────────────────────────────────────
 *  Unified ChatThread schema
 *  - "participants" flow  (conversations.ts / chat.ts – DM system)
 *  - "userId + partner"  flow  (thread.controller.ts – legacy interaction threads)
 *  Both live in the same "chatthreads" collection.
 * ────────────────────────────────────────────────────────── */
export interface IChatThread {
  _id: Types.ObjectId;
  /* DM fields */
  participants: Types.ObjectId[];
  lastMessageAt: Date;
  lastMessageText?: string;
  unread: Map<string, number>;
  isPaused: boolean;
  safetyStatus: "green" | "yellow" | "red";
  /* Legacy interaction-thread fields */
  userId?: Types.ObjectId;
  partner?: string;
  /* timestamps */
  createdAt: Date;
  updatedAt: Date;
}

/* ──────────────────────────────────────────────────────────
 *  Unified ChatMessage schema
 *  - "thread + sender(ObjectId)" flow  (conversations.ts / chat.ts)
 *  - "threadId + sender(string)"  flow  (thread.controller.ts)
 * ────────────────────────────────────────────────────────── */
export interface IChatMessage {
  _id: Types.ObjectId;
  thread?: Types.ObjectId;
  threadId?: Types.ObjectId;
  sender: any;           // ObjectId (DM) or string (legacy 'user'|'assistant')
  text: string;
  flag: "green" | "yellow" | "red";
  flaggedCategories?: string[];
  clientId?: string | null;
  createdAt: Date;
  readBy: Types.ObjectId[];
}

const ChatThreadSchema = new Schema<IChatThread>(
  {
    /* DM fields */
    participants: { type: [Schema.Types.ObjectId], ref: 'User', index: true, default: [] },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastMessageText: String,
    unread: { type: Map, of: Number, default: {} },
    isPaused: { type: Boolean, default: false },
    safetyStatus: { type: String, enum: ["green", "yellow", "red"], default: "green" },
    /* Legacy interaction-thread fields */
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    partner: { type: String },
  },
  { timestamps: true }
);

ChatThreadSchema.index({ participants: 1 }, { unique: false });
ChatThreadSchema.index({ userId: 1, partner: 1 }, { sparse: true });

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    thread:   { type: Schema.Types.ObjectId, ref: 'ChatThread', index: true },
    threadId: { type: Schema.Types.ObjectId, ref: 'ChatThread', index: true },
    sender:   { type: Schema.Types.Mixed, required: true, index: true },
    text:     { type: String, required: true },
    flag:     { type: String, enum: ["green", "yellow", "red"], default: "green" },
    flaggedCategories: { type: [String], default: [] },
    clientId: { type: String, required: false, index: true, default: null },
    readBy:   [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ChatThread = (mongoose.models.ChatThread as mongoose.Model<IChatThread>) || mongoose.model<IChatThread>('ChatThread', ChatThreadSchema);
export const ChatMessage = (mongoose.models.ChatMessage as mongoose.Model<IChatMessage>) || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);


