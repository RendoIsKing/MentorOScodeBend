import { Router } from "express";

import { AuthController } from "../app/Controllers";
import Auth from "../app/Middlewares/auth";

const auth: Router = Router();

auth.post("/register", AuthController.regsiter);
auth.post("/login", AuthController.login);
auth.post("/user-login", AuthController.userLogin);
auth.post("/verify-otp", AuthController.verifyOtp);
auth.get("/me",Auth, AuthController.me)
auth.post("/me", Auth, AuthController.updateMe)
auth.post("/checkUser", AuthController.checkUser);

export default auth;
