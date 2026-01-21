import { Router } from "express";
import { Auth, validateZod } from "../app/Middlewares";
import { NotificationController } from "../app/Controllers/Notifications";
import { z } from "zod";
import { objectIdParam } from "../app/Validation/requestSchemas";

const NotificationRoutes: Router = Router();

// NotificationRoutes.post("/", Auth, NotificationController.sendNotification);
NotificationRoutes.get("/", Auth, NotificationController.getNotifications);
NotificationRoutes.delete("/:id", Auth, validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), NotificationController.deleteNotification);

export default NotificationRoutes;
