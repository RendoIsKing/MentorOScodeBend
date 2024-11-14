import { Document, Types } from "mongoose";
import { UserInterface } from "./UserInterface";
import { FirebaseNotificationEnum } from "./enums/FirebaseNotificationEnum";
import { IPostSchema } from "./interfaces/postsInterface";

export interface NotificationInterface extends Document {
  title: string;
  description: string;
  sentTo: Types.ObjectId | UserInterface;
  readAt?: Date;
  isDeleted: boolean;
  type: FirebaseNotificationEnum;
  notificationOnPost: Types.ObjectId | IPostSchema;
  notificationFromUser: Types.ObjectId | UserInterface;
  deletedAt: Date;
}
