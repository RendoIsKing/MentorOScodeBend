import { Router } from "express";
import { Auth } from "../app/Middlewares";
import { UserDataController } from "../app/Controllers/UserData";

const userDataRoutes: Router = Router();
userDataRoutes.post("/", Auth, UserDataController.processUserData);
userDataRoutes.post("/download", Auth, UserDataController.downloadUserData);
userDataRoutes.get("/", Auth, UserDataController.getUserData);

export default userDataRoutes;
