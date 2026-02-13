import { UserInterface } from "./UserInterface";
import { FirebaseNotificationEnum } from "./enums/FirebaseNotificationEnum";
import { IPostSchema } from "./interfaces/postsInterface";

export interface NotificationInterface {
  _id?: string;
  id?: string;
  title: string;
  description: string;
  sentTo: string | UserInterface;
  readAt?: Date;
  isDeleted: boolean;
  type: FirebaseNotificationEnum;
  notificationOnPost: string | IPostSchema;
  notificationFromUser: string | UserInterface;
  deletedAt: Date;
}
