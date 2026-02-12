// Re-export from the unified schema so only ONE ChatThread / ChatMessage
// Mongoose model is ever registered, regardless of import order.
export { ChatThread, ChatMessage } from '../../models/chat';


