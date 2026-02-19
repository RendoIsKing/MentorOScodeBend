import { Router } from "express";
import { AuthController } from "../app/Controllers";
import Auth from "../app/Middlewares/auth";
import { validateZod } from "../app/Middlewares";
import { z } from "zod";
import { nonEmptyString } from "../app/Validation/requestSchemas";

const auth: Router = Router();

const registerSchema = z.object({
  firstName: nonEmptyString,
  lastName: nonEmptyString,
  email: z.string().email(),
  phoneNumber: nonEmptyString,
  password: nonEmptyString,
  dialCode: nonEmptyString,
  country: nonEmptyString,
  fullName: z.string().optional(),
  userName: z.string().optional(),
  gender: z.string().optional(),
}).strict();

const loginSchema = z.object({
  email: z.string().email(),
  password: nonEmptyString,
}).strict();

const optionalTrimmed = (schema: z.ZodTypeAny) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }, schema.optional());

const userLoginSchema = z
  .object({
    dialCode: optionalTrimmed(z.string()),
    phoneNumber: optionalTrimmed(z.string()),
    email: optionalTrimmed(z.string().email()),
    userName: optionalTrimmed(z.string()),
    username: optionalTrimmed(z.string()),
    password: optionalTrimmed(z.string()),
    rememberMe: z.boolean().optional(),
  })
  .strict()
  .transform((data) => ({
    ...data,
    userName: data.userName || data.username,
  }))
  .refine((data) => Boolean(data.email || data.phoneNumber || data.userName), {
    message: "email, phoneNumber, or userName is required",
  });

const googleLoginSchema = z.object({
  idToken: nonEmptyString,
  rememberMe: z.boolean().optional(),
}).strict();

const otpSchema = z.object({
  otp: nonEmptyString,
  id: nonEmptyString,
}).strict();

const checkUserSchema = z.object({
  phoneNumber: nonEmptyString,
  dialCode: nonEmptyString,
  email: nonEmptyString,
  country: nonEmptyString,
}).strict();

const forgotPasswordSchema = z.object({
  dialCode: nonEmptyString,
  phoneNumber: nonEmptyString,
}).strict();

const resetPasswordSchema = z.object({
  dialCode: nonEmptyString,
  phoneNumber: nonEmptyString,
  newPassword: nonEmptyString,
  confirmPassword: nonEmptyString,
}).strict();

const updateMeSchema = z.object({
  fullName: z.string().optional(),
  userName: z.string().optional(),
  password: z.string().optional(),
  phoneNumber: z.string().optional(),
  dob: z.string().optional(),
  bio: z.string().optional(),
  youtubeLink: z.string().optional(),
  instagramLink: z.string().optional(),
  tiktokLink: z.string().optional(),
  facebookLink: z.string().optional(),
  gender: z.string().optional(),
  email: z.string().email().optional(),
  dialCode: z.string().optional(),
  photoId: z.string().optional(),
  coverPhotoId: z.string().optional(),
  isMentor: z.boolean().optional(),
  mentorExpertise: z.array(z.string()).optional(),
  mentorCertifications: z.array(z.string()).optional(),
  mentorYearsExperience: z.number().optional(),
  mentorHasFreeTrial: z.boolean().optional(),
  mentorRating: z.number().optional(),
  mentorReviewCount: z.number().optional(),
  mentorAiVoiceTone: z.string().optional(),
  mentorAiKnowledgeBaseFileIds: z.array(z.string()).optional(),
  mentorAiTrainingPhilosophy: z.string().optional(),
  mentorAiNutritionPhilosophy: z.string().optional(),
  mentorAiMacroApproach: z.string().optional(),
  mentorAiDietaryNotes: z.string().optional(),
  welcomeMessage: z.string().optional(),
  websiteLink: z.string().optional(),
  notificationPreferences: z.object({
    new_subscriber: z.boolean().optional(),
    new_message: z.boolean().optional(),
    payment_received: z.boolean().optional(),
    safety_flag: z.boolean().optional(),
  }).optional(),
}).strict();

auth.post("/register", validateZod({ body: registerSchema }), AuthController.regsiter);
auth.post("/login", validateZod({ body: loginSchema }), AuthController.login);
auth.post("/user-login", validateZod({ body: userLoginSchema }), AuthController.userLogin);
auth.post("/google", validateZod({ body: googleLoginSchema }), AuthController.googleLogin);
auth.post("/verify-otp", validateZod({ body: otpSchema }), AuthController.verifyOtp);
auth.post("/me", Auth, validateZod({ body: updateMeSchema }), AuthController.updateMe);
auth.post("/checkUser", validateZod({ body: checkUserSchema }), AuthController.checkUser);
auth.post("/forget-password", validateZod({ body: forgotPasswordSchema }), AuthController.sendForgotPasswordOtp);
auth.post("/validate-otp", validateZod({ body: otpSchema }), AuthController.validateForgotPasswordOtp);
auth.put("/reset-password", validateZod({ body: resetPasswordSchema }), AuthController.resetPassword);

auth.get("/me", Auth, AuthController.me);

// Refresh access token using refresh token cookie
auth.post('/refresh', AuthController.refreshToken);

auth.post('/logout', validateZod({ body: z.object({}).strict() }), (req, res)=>{
  try {
    // Clear both access and refresh token cookies
    res.cookie('auth_token', '', { maxAge: 0, path: '/', sameSite: 'lax' });
    res.cookie('refresh_token', '', { maxAge: 0, path: '/', sameSite: 'lax' });
    try { (req as any).session?.destroy?.(()=>{}); } catch {}
    return res.json({ ok: true });
  } catch {
    return res.status(200).json({ ok: true });
  }
});

export default auth;
