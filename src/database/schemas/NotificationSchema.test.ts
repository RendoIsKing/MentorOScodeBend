import mongoose from 'mongoose';

export function buildTestNotificationSchema(m: typeof mongoose) {
  const NotificationSchema = new m.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    sentTo: [
      {
        type: m.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    createdAt: { type: Date, default: Date.now },
  });
  return NotificationSchema;
}


