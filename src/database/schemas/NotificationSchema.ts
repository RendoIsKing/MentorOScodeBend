import mongoose, { Schema } from "mongoose";
import { FirebaseNotificationEnum } from "../../types/enums/FirebaseNotificationEnum";

const NotificationSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    sentTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    readAt: { type: Date, default: null },
    type: {
      type: String,
      enum: Object.values(FirebaseNotificationEnum),
      required: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    notificationOnPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },
    notificationFromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export { NotificationSchema };
