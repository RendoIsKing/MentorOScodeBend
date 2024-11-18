import { Request, Response } from "express";
// import { sendNotification } from "./Actions/saveNotification";
import { getNotifications } from "./Actions/getNotification";
import { deleteNotification } from "./Actions/deleteNotification";

export class NotificationController {
  // static sendNotification = async (req: Request, res: Response) => {
  //   return sendNotification(req, res);
  // };
  static getNotifications = async (req: Request, res: Response) => {
    return getNotifications(req, res);
  }

  static deleteNotification = async (req: Request, res: Response) => {
    return deleteNotification(req, res);
  }
}
