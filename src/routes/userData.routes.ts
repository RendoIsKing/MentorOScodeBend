import { Router } from "express";
import { Auth, validateZod } from "../app/Middlewares";
import { UserDataController } from "../app/Controllers/UserData";
import { z } from "zod";

const userDataRoutes: Router = Router();
userDataRoutes.post("/", Auth, validateZod({ body: z.object({}).passthrough() }), UserDataController.processUserData);
userDataRoutes.post("/download", Auth, validateZod({ body: z.object({}).passthrough() }), UserDataController.downloadUserData);
userDataRoutes.get("/", Auth, UserDataController.getUserData);

export default userDataRoutes;
