import { model, Model } from "mongoose";
import { NotificationInterface } from "../../types/NotificationInterface";
import { NotificationSchema } from "../../database/schemas/NotificationSchema";

const Notification: Model<NotificationInterface> = model<NotificationInterface>(
  "Notification",
  NotificationSchema
);

export { Notification };
