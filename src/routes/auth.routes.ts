import { Router } from "express";
import { AuthController } from "../app/Controllers";
import Auth from "../app/Middlewares/auth";

const auth: Router = Router();

auth.post("/register", AuthController.regsiter);
auth.post("/login", AuthController.login);
auth.post("/user-login", AuthController.userLogin);
auth.post("/verify-otp", AuthController.verifyOtp);
auth.post("/me", Auth, AuthController.updateMe);
auth.post("/checkUser", AuthController.checkUser);
auth.post("/forget-password", AuthController.sendForgotPasswordOtp);
auth.post("/validate-otp", AuthController.validateForgotPasswordOtp);
auth.put("/reset-password", AuthController.resetPassword);

auth.get("/me", Auth, AuthController.me);
auth.post('/logout', (req, res)=>{
  try {
    res.cookie('auth_token', '', { maxAge: 0, path: '/', sameSite: 'lax' });
    try { (req as any).session?.destroy?.(()=>{}); } catch {}
    return res.json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true });
  }
});

export default auth;
