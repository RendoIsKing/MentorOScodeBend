import { model, Model } from 'mongoose';
import { ChatThreadSchema, IChatThread } from '../../database/schemas/ChatThreadSchema';
import { ChatMessageSchema, IChatMessage } from '../../database/schemas/ChatMessageSchema';

const ChatThread: Model<IChatThread> = model<IChatThread>('ChatThread', ChatThreadSchema);
const ChatMessage: Model<IChatMessage> = model<IChatMessage>('ChatMessage', ChatMessageSchema);

export { ChatThread, ChatMessage };


