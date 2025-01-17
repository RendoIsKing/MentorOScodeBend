import { Types } from "mongoose";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { Notification } from "../../../Models/Notification"; // Adjust the path as needed

interface SaveNotificationInput {
  title: string;
  description: string;
  sentTo: string[];
  type: FirebaseNotificationEnum;
  notificationOnPost: Types.ObjectId | null;
  notificationFromUser: Types.ObjectId | null;
}

export const saveNotification = async (input: SaveNotificationInput) => {
  const {
    title,
    description,
    sentTo,
    type,
    notificationOnPost,
    notificationFromUser,
  } = input;

  const notification = new Notification({
    title,
    description,
    sentTo,
    type,
    notificationOnPost,
    notificationFromUser,
  });

  await notification.save();
};
