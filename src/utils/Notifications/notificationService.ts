import { Message } from "firebase-admin/lib/messaging/messaging-api";
import admin from "../firebaseConfig";

export const sendNotification = async (
  token: string,
  title: string,
  body: string,
  type: string,
  actionTo: string,
  data?: object
) => {
  const message: Message = {
    // notification: {
    //   title,
    //   body,
    // },
    data: {
      ...data,
      title,
      body,
      type,
      actionTo,
    },
    token,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Successfully sent message:", response);
  } catch (error) {
    console.error("Error sending message:", error);
  }
};
