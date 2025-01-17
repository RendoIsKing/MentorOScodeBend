import { Router } from "express";
import { Auth } from "../app/Middlewares";
import { NotificationController } from "../app/Controllers/Notifications";

const NotificationRoutes: Router = Router();

// NotificationRoutes.post("/", Auth, NotificationController.sendNotification);
NotificationRoutes.get("/", Auth, NotificationController.getNotifications);
NotificationRoutes.delete("/:id", Auth, NotificationController.deleteNotification);

export default NotificationRoutes;
