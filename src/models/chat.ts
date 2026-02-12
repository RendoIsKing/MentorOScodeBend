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
export interface IChatAttachment {
  url: string;
  type: string;      // mime type (image/jpeg, image/png, etc.)
  filename: string;
}

export interface IChatMessage {
  _id: Types.ObjectId;
  thread?: Types.ObjectId;
  threadId?: Types.ObjectId;
  sender: any;           // ObjectId (DM) or string (legacy 'user'|'assistant')
  text: string;
  flag: "green" | "yellow" | "red";
  flaggedCategories?: string[];
  clientId?: string | null;
  attachments?: IChatAttachment[];
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
    attachments: [{
      url: { type: String, required: true },
      type: { type: String, required: true },
      filename: { type: String, required: true },
    }],
    readBy:   [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ChatThread = (mongoose.models.ChatThread as mongoose.Model<IChatThread>) || mongoose.model<IChatThread>('ChatThread', ChatThreadSchema);
export const ChatMessage = (mongoose.models.ChatMessage as mongoose.Model<IChatMessage>) || mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);

// Drop the legacy unique index {userId, partner} that blocks DM thread creation.
// The old ChatThreadSchema had: ChatThreadSchema.index({ userId: 1, partner: 1 }, { unique: true })
// which prevents multiple DM threads (they all have null userId/partner → duplicate key).
// The new index is { userId: 1, partner: 1, sparse: true } which allows nulls.
void (async () => {
  try {
    const indexes = await ChatThread.collection.indexes();
    const legacy = indexes.find((i: any) =>
      i.key?.userId === 1 && i.key?.partner === 1 && i.unique === true
    );
    if (legacy) {
      console.log('[chat:init] Dropping legacy unique index:', legacy.name);
      await ChatThread.collection.dropIndex(legacy.name);
      console.log('[chat:init] Legacy index dropped successfully');
    }
  } catch (err: any) {
    // Non-fatal: index might not exist or DB might not be connected yet
    if (!String(err?.message || '').includes('not found')) {
      console.error('[chat:init] Index cleanup error (non-fatal):', err?.message);
    }
  }
})();


