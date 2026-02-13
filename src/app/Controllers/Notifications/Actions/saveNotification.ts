import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { insertOne, Tables } from "../../../../lib/db";

interface SaveNotificationInput {
  title: string;
  description: string;
  sentTo: string[];
  type: FirebaseNotificationEnum;
  notificationOnPost: string | null;
  notificationFromUser: string | null;
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

  await insertOne(Tables.NOTIFICATIONS, {
    title,
    description,
    sent_to: sentTo,
    type,
    notification_on_post: notificationOnPost,
    notification_from_user: notificationFromUser,
  });
};
