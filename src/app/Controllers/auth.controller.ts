import { Request, Response } from "express";
import { validate } from "class-validator";
import passport from "passport";
import { genSaltSync, hashSync, compareSync } from "bcryptjs";
import { compareAsc } from "date-fns";

import { ValidationErrorResponse } from "../../types/ValidationErrorResponse";
import { RegisterInput } from "../Inputs/Register.input";
import { User } from "../Models/User";
import { Subscription } from "../Models/Subscription";

import { UserInterface } from "../../types/UserInterface";

import { LoginInput } from "../Inputs/Login.input";
import { generateAuthToken } from "../../utils/jwt";
import { RolesEnum } from "../../types/RolesEnum";
import { CheckUserInput } from "../Inputs/checkUser.input";
import { plainToClass } from "class-transformer";
import { addMinutes } from "date-fns";
import otpGenerator from "../../utils/otpGenerator";
import { OTPInput } from "../Inputs/OTPInput";
import { UpdateUserDTO } from "../Inputs/UpdateUser.input";

import { UserForgotPasswordDto } from "../Inputs/UserForgotPassword.input";
import mongoose from "mongoose";
import { SubscriptionPlanType } from "../../types/enums/subscriptionPlanEnum";
import { InteractionType } from "../../types/enums/InteractionTypeEnum";
import { PostType } from "../../types/enums/postTypeEnum";
import { SubscriptionStatusEnum } from "../../types/enums/SubscriptionStatusEnum";
import { sendMessage } from "../../utils/Twillio/sendMessage";
import { OAuth2Client } from "google-auth-library";

class AuthController {
  /**
   * Handle Google OAuth login and issue auth token.
   */
  static googleLogin = async (req: Request, res: Response): Promise<Response> => {
    try {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      if (!clientId) return res.status(500).json({ message: "GOOGLE_OAUTH_CLIENT_ID missing" });
      const { idToken } = (req.body || {}) as { idToken?: string };
      if (!idToken) return res.status(400).json({ message: "idToken required" });

      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub || !payload.email) {
        return res.status(401).json({ message: "Invalid Google token" });
      }

      const googleId = payload.sub;
      const email = String(payload.email).toLowerCase();

      let user = await User.findOne({ $or: [{ googleId }, { email }] });
      let isNewUser = false;
      
      if (!user) {
        // Brand new Google user - needs onboarding
        user = await User.create({
          firstName: payload.given_name || "",
          lastName: payload.family_name || "",
          email,
          googleId,
          role: RolesEnum.USER,
          isActive: true,
          isVerified: true,
        } as any);
        isNewUser = true;
      } else if (!user.googleId) {
        // Existing email user linking Google
        (user as any).googleId = googleId;
        await user.save();
      }
      
      // Check if user needs to complete onboarding (no userName set)
      if (!user.userName || user.userName.trim() === '') {
        isNewUser = true;
      }

      const token = generateAuthToken(user as unknown as UserInterface);
      try {
        const isProd = process.env.NODE_ENV === 'production';
        const sameSiteEnv = String(process.env.SESSION_SAMESITE || (isProd ? 'none' : 'lax')).toLowerCase();
        const cookieSameSite = (sameSiteEnv === 'none' ? 'none' : 'lax') as any;
        const secureEnv = String(process.env.SESSION_SECURE || (isProd ? 'true' : 'false')).toLowerCase();
        const cookieSecure = secureEnv === 'true' || secureEnv === '1';
        const cookieDomain = (process.env.SESSION_COOKIE_DOMAIN || '').trim();
        const cookieOpts: any = { httpOnly: true, sameSite: cookieSameSite, secure: cookieSecure, maxAge: 1000*60*60*24*30, path: '/' };
        if (cookieDomain) cookieOpts.domain = cookieDomain;
        res.cookie('auth_token', token, cookieOpts);
      } catch {}

      return res.json({
        token,
        isNewUser,
        user: {
          id: user._id,
          email: user.email,
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
          role: user.role,
        },
      });
    } catch (e) {
      const msg = (e as any)?.message || String(e);
      return res.status(401).json({ message: msg || 'Google login failed' });
    }
  };
  // NOTE: legacy misspelling kept for backward compatibility with any callers
  /**
   * Register a new user using email/phone credentials.
   */
  static regsiter = async (req: Request, res: Response): Promise<any> => {
    const input = req.body;

    const registerInput = new RegisterInput();

    registerInput.firstName = input.firstName;
    registerInput.lastName = input.lastName;
    registerInput.email = input.email;
    registerInput.phoneNumber = input.phoneNumber;
    registerInput.password = input.password;
    registerInput.dialCode = input.dialCode;
    registerInput.country = input.country;
    registerInput.fullName = input.fullName;
    registerInput.userName = input.userName;
    registerInput.gender = input.gender;
    const errors = await validate(registerInput);

    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res
        .status(400)
        .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
    }
    try {
      const user = await User.findOne({
        $or: [
          { email: input.email },
          {
            completePhoneNumber: `${input.country}--${input.dialCode}--${input.phoneNumber}`,
          },
        ],
      });
      if (!user) {
        const salt = genSaltSync(10);
        const hashPassword = hashSync(input.password, salt);

        await User.create({
          firstName: input.firstName,
          lastName: input.lastName,
          fullName: input.fullName,
          userName: input.userName,
          gender: input.gender,
          email: input.email,
          password: hashPassword,
          role: RolesEnum.USER,
          phoneNumber: input.phoneNumber,
          country: input.country,
          dialCode: input.dialCode,
          completePhoneNumber: `${input.country}--${input.dialCode}--${input.phoneNumber}`,
          isActive: true, //need to delete
          isVerified: true, //need to delete
        });

        passport.authenticate(
          "local",
          { session: false },
          (err: any, user: UserInterface, message: Object) => {
            if (!user) {
              if (err) {
                return res.status(400).json({ error: err });
              }
              return res.status(401).json({ error: message });
            } else if (!user.isActive) {
              return res
                .status(401)
                .json({ error: "User not active.Please contact admin." });
            } else if (!user.isVerified) {
              return res.status(401).json({
                error: "User not verified.Please verify your account",
              });
            } else if (user.isDeleted) {
              return res
                .status(401)
                .json({ error: "User is deleted.Please contact admin" });
            }
            const token = generateAuthToken(user);
            try {
              const isProd = process.env.NODE_ENV === 'production';
              const sameSiteEnv = String(process.env.SESSION_SAMESITE || (isProd ? 'none' : 'lax')).toLowerCase();
              const cookieSameSite = (sameSiteEnv === 'none' ? 'none' : 'lax') as any;
              const secureEnv = String(process.env.SESSION_SECURE || (isProd ? 'true' : 'false')).toLowerCase();
              const cookieSecure = secureEnv === 'true' || secureEnv === '1';
              const cookieDomain = (process.env.SESSION_COOKIE_DOMAIN || '').trim();
              const cookieOpts: any = { httpOnly: true, sameSite: cookieSameSite, secure: cookieSecure, maxAge: 1000*60*60*24*30, path: '/' };
              if (cookieDomain) cookieOpts.domain = cookieDomain;
              res.cookie('auth_token', token, cookieOpts);
            } catch {}
            return res.json({
              data: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                lastLogin: user.lastLogin,
                image: user.photoId,
                phoneNumber: user.phoneNumber,
                country: user.country,
                dialCode: user.dialCode,
                token,
              },
            });
          }
        )(req, res);
      } else {
        return res.status(400).json({
          data: {
            message: "User already exists with same email or phone number.",
          },
        });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  /**
   * Authenticate user credentials and return auth token.
   */
  static login = async (req: Request, res: Response): Promise<Response> => {
    const input = req.body;
    const loginInput = new LoginInput();
    loginInput.email = input.email;
    loginInput.password = input.password;
    const errors = await validate(loginInput);

    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res.status(400).json({
        error: { message: "VALIDATIONS_ERROR", info: { errorsInfo } },
      });
    }
    return passport.authenticate(
      "local",
      { session: false },
      (err: any, user: UserInterface, message: Object) => {
        if (!user) {
          if (err) {
            return res.status(400).json({ error: err });
          }
          return res.status(401).json({ error: message });
        } else if (!user.isActive) {
          return res
            .status(401)
            .json({ error: "User not active.Please contact admin." });
        } else if (!user.isVerified) {
          return res
            .status(401)
            .json({ error: "User not verified.Please verify your account" });
        } else if (user.isDeleted) {
          return res
            .status(401)
            .json({ error: "User is deleted.Please contact admin" });
        }
        const token = generateAuthToken(user);
        try {
          const isProd = process.env.NODE_ENV === 'production';
          const sameSiteEnv = String(process.env.SESSION_SAMESITE || (isProd ? 'none' : 'lax')).toLowerCase();
          const cookieSameSite = (sameSiteEnv === 'none' ? 'none' : 'lax') as any;
          const secureEnv = String(process.env.SESSION_SECURE || (isProd ? 'true' : 'false')).toLowerCase();
          const cookieSecure = secureEnv === 'true' || secureEnv === '1';
          const cookieDomain = (process.env.SESSION_COOKIE_DOMAIN || '').trim();
          const cookieOpts: any = { httpOnly: true, sameSite: cookieSameSite, secure: cookieSecure, maxAge: 1000*60*60*24*30, path: '/' };
          if (cookieDomain) cookieOpts.domain = cookieDomain;
          res.cookie('auth_token', token, cookieOpts);
        } catch {}
        return res.json({
          data: {
            _id: user._id,
            firstName: user?.firstName,
            lastName: user?.lastName,
            email: user?.email,
            role: user?.role,
            lastLogin: user?.lastLogin,
            image: user?.photoId,
            phoneNumber: user?.phoneNumber,
            country: user?.country,
            dialCode: user?.dialCode,
            token,
          },
        });
      }
    )(req, res);
  };

  /**
   * Update authenticated user's profile, with optional password change.
   */
  static updateMe = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = req.user as UserInterface;
      const updateData = plainToClass(UpdateUserDTO, req.body);

      const errors = await validate(updateData);
      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      // If password change requested, require and verify currentPassword
      if (updateData.password) {
        const currentPassword = (req.body as any)?.currentPassword as string | undefined;
        // Fetch fresh user to compare hash (and to detect first-time password set during onboarding)
        const dbUser = await User.findById(user.id).select("password hasPersonalInfo userName");
        const hasExistingPassword = Boolean(dbUser?.password);
        const isOnboarding = !dbUser?.hasPersonalInfo || !dbUser?.userName;

        // If the user already has a password, require currentPassword to change it,
        // except during onboarding where we allow setting the initial password.
        if (hasExistingPassword && !isOnboarding) {
          if (!currentPassword) {
            return res.status(400).json({ error: { message: "CURRENT_PASSWORD_REQUIRED" } });
          }
          if (!compareSync(currentPassword, dbUser!.password as any)) {
            return res.status(400).json({ error: { message: "CURRENT_PASSWORD_INVALID" } });
          }
        }
        const salt = genSaltSync(10);
        updateData.password = hashSync(updateData.password, salt);
        // Do not log sensitive data
      }
      const updatedUser = await User.findByIdAndUpdate(user.id, updateData, {
        new: true,
      });

      if (updatedUser?.photoId) {
        updatedUser.hasPhotoInfo = true;
        await updatedUser.save();
      }

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        data: updatedUser,
        message: "User updated successfully",
      });
    } catch (error) {
      console.error("Error in user Updation", error);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };

  /**
   * Handle mixed login flows: OTP-based phone auth or password login.
   */
  static userLogin = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, username, phoneNumber, password, dialCode } = req.body || {};

      // Branch A: Phone-only initiation (no password) → generate OTP (signup/OTP login flow)
      if (!password && (phoneNumber || email || username)) {
        // Normalize phone from either "dial--num", "country--dial--num", or separate dialCode/phoneNumber
        let dial = '';
        let num = '';
        if (typeof phoneNumber === 'string' && phoneNumber.includes('--')) {
          const parts = phoneNumber.split('--');
          if (parts.length === 2) {
            dial = String(parts[0] || '').replace(/^\+/, '').replace(/\s+/g, '');
            num = String(parts[1] || '').replace(/\s+/g, '');
          } else if (parts.length === 3) {
            dial = String(parts[1] || '').replace(/^\+/, '').replace(/\s+/g, '');
            num = String(parts[2] || '').replace(/\s+/g, '');
          }
        } else if (phoneNumber && dialCode) {
          dial = String(dialCode || '').replace(/^\+/, '').replace(/\s+/g, '');
          num = String(phoneNumber || '').replace(/\s+/g, '');
        }
        if (!dial || !num) {
          return res.status(422).json({ message: 'dialCode and phoneNumber are required' });
        }

        // Find or create user by phone with atomic upsert
        const orQuery: any[] = [
          { completePhoneNumber: `${dial}--${num}` },
          { $and: [{ dialCode: dial }, { phoneNumber: num }] },
        ];
        const user = await User.findOneAndUpdate(
          { isDeleted: false, $or: orQuery },
          {
            $setOnInsert: {
              firstName: '',
              lastName: '',
              email: email || undefined,
              dialCode: dial,
              phoneNumber: num,
              role: RolesEnum.USER,
              isActive: true,
              isVerified: false,
            },
          },
          { upsert: true, new: true }
        );

        const otp = otpGenerator();
        const otpInvalidAt = addMinutes(new Date(), 10);
        await User.findByIdAndUpdate(user._id, { otp: String(otp), otpInvalidAt });

        // Send OTP (dev: also return it in response for easy verification)
        try {
          await sendMessage(`${dial}--${num}`, `Your OTP is: ${otp}`);
        } catch (e) {
          // ignore SMS errors in dev
        }

        return res.status(200).json({
          data: { _id: user._id, dialCode: dial, phoneNumber: num, otp },
          message: 'OTP sent successfully',
        });
      }

      // Accept both formats: "<dialCode>--<number>" and "<country>--<dialCode>--<number>"
      const orClauses: any[] = [];
      if (email) orClauses.push({ email });
      if (username) orClauses.push({ userName: username });

      if (typeof phoneNumber === "string" && phoneNumber.includes("--")) {
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
        const parts = phoneNumber.split("--");
        if (parts.length === 2) {
          const [rawDial, rawNum] = parts;
          const dial = String(rawDial || "").replace(/^\+/, "").replace(/\s+/g, "");
          const num = String(rawNum || "").replace(/\s+/g, "");
          // Try exact two-part match and a regex that matches stored three-part format
          orClauses.push({ completePhoneNumber: `${dial}--${num}` });
          orClauses.push({
            completePhoneNumber: {
              // Some legacy data stored dialCode with a leading '+' (e.g. "NO--+47--48290380")
              $regex: new RegExp(`^[A-Za-z]{2}--\\+?${esc(dial)}--${esc(num)}$`, "i"),
            },
          });
          // Also allow direct match on separate fields
          orClauses.push({ $and: [{ dialCode: dial }, { phoneNumber: num }] });
          orClauses.push({ $and: [{ dialCode: `+${dial}` }, { phoneNumber: num }] });
        } else {
          // Already three-part; try exact match
          const [, rawDial3, rawNum3] = parts as any;
          const dial3 = String(rawDial3 || "").replace(/^\+/, "").replace(/\s+/g, "");
          const num3 = String(rawNum3 || "").replace(/\s+/g, "");
          orClauses.push({ completePhoneNumber: `${dial3}--${num3}` });
          orClauses.push({ $and: [{ dialCode: dial3 }, { phoneNumber: num3 }] });
          orClauses.push({ $and: [{ dialCode: `+${dial3}` }, { phoneNumber: num3 }] });
        }
      } else if (phoneNumber && dialCode) {
        // Support legacy frontend payload: { dialCode: "47", phoneNumber: "48290380", password }
        // (Earlier code accidentally only supported phoneNumber strings containing "--".)
        const esc = (s: string) => s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
        const dial = String(dialCode || "").replace(/^\+/, "").replace(/\s+/g, "");
        const num = String(phoneNumber || "").replace(/\s+/g, "");
        if (dial && num) {
          orClauses.push({ completePhoneNumber: `${dial}--${num}` });
          orClauses.push({
            completePhoneNumber: {
              $regex: new RegExp(`^[A-Za-z]{2}--\\+?${esc(dial)}--${esc(num)}$`, "i"),
            },
          });
          orClauses.push({ $and: [{ dialCode: dial }, { phoneNumber: num }] });
          orClauses.push({ $and: [{ dialCode: `+${dial}` }, { phoneNumber: num }] });
        }
      }

      const user = await User.findOne({
        ...(orClauses.length ? { $or: orClauses } : {}),
        isDeleted: false,
      });

      if (!user || !user.password || !compareSync(password, user.password)) {
        return res.status(400).json({ message: "Invalid login credentials" });
      }

      // @ts-ignore
      req.session.user = {
        id: user._id,
        email: user.email,
        role: user.role,
      };

      const token = generateAuthToken(user as unknown as UserInterface);
      // Set cookie to support endpoints that read from cookies (student/interaction routes)
      try {
        const isProd = process.env.NODE_ENV === 'production';
        const sameSiteEnv = String(process.env.SESSION_SAMESITE || (isProd ? 'none' : 'lax')).toLowerCase();
        const cookieSameSite = (sameSiteEnv === 'none' ? 'none' : 'lax') as any;
        const secureEnv = String(process.env.SESSION_SECURE || (isProd ? 'true' : 'false')).toLowerCase();
        const cookieSecure = secureEnv === 'true' || secureEnv === '1';
        const cookieDomain = (process.env.SESSION_COOKIE_DOMAIN || '').trim();
        const cookieOpts: any = { httpOnly: true, sameSite: cookieSameSite, secure: cookieSecure, maxAge: 1000*60*60*24*30, path: '/' };
        if (cookieDomain) cookieOpts.domain = cookieDomain;
        res.cookie('auth_token', token, cookieOpts);
      } catch {}

      return res.json({
        message: "User login successfully",
        token,
        user: {
          id: user._id,
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
          email: user.email,
          role: user.role,
          userName: user.userName,
        },
      });
    } catch (error) {
      const msg = (error as any)?.message || String(error);
      console.error('[auth:user-login] failed', msg);
      // Always return the error message during debugging so we can see the exact cause
      return res.status(500).json({ message: msg });
    }
  };

  /**
   * Check whether a user exists by email/phone.
   */
  static checkUser = async (req: Request, res: Response): Promise<Response> => {
    const input = req.body;
    const userInput = new CheckUserInput();

    userInput.email = input.email;
    userInput.phoneNumber = input.phoneNumber;
    userInput.dialCode = input.dialCode;
    userInput.country = input.country;

    const errors = await validate(userInput);

    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res.status(400).json({
        error: { message: "VALIDATIONS_ERROR", info: { errorsInfo } },
      });
    }
    const user = await User.findOne({
      $or: [
        { email: input.email },
        {
          completePhoneNumber: `${input.country}--${input.dialCode}--${input.phoneNumber}`,
        },
      ],
    });
    if (user) {
      return res.json({ data: { message: "User exist." } });
    } else {
      return res
        .status(400)
        .json({ data: { message: "User does not exist." } });
    }
  };

  /**
   * Verify OTP and issue auth token for the user.
   */
  static verifyOtp = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id, otp } = req.body;
      const otpInput = new OTPInput();

      otpInput.id = id;
      otpInput.otp = otp;

      const errors = await validate(otpInput);

      if (errors.length) {
        const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
          property: error.property,
          constraints: error.constraints,
        }));

        return res
          .status(400)
          .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
      }

      const objectId = otpInput.id;

      const user = await User.findById(objectId);
      if (!user) {
        return res.status(400).json({ error: { message: "User not found" } });
      }

      if (user.otp != otp || compareAsc(new Date(), user.otpInvalidAt) === 1) {
        return res.status(400).json({ data: { message: "otp is invalid" } });
      }

      const updatedUser = (await User.findByIdAndUpdate(
        objectId,
        { isVerified: true, verifiedAt: new Date(), otp: "" },
        { new: true }
      )) as UserInterface;

      const token = await generateAuthToken(updatedUser);

      // Set auth cookie so subsequent cross-site requests include credentials
      try {
        const isProd = process.env.NODE_ENV === 'production';
        const sameSiteEnv = String(process.env.SESSION_SAMESITE || (isProd ? 'none' : 'lax')).toLowerCase();
        const cookieSameSite = (sameSiteEnv === 'none' ? 'none' : 'lax') as any;
        const secureEnv = String(process.env.SESSION_SECURE || (isProd ? 'true' : 'false')).toLowerCase();
        const cookieSecure = secureEnv === 'true' || secureEnv === '1';
        const cookieDomain = (process.env.SESSION_COOKIE_DOMAIN || '').trim();
        const cookieOpts: any = {
          httpOnly: true,
          sameSite: cookieSameSite,
          secure: cookieSecure,
          maxAge: 1000 * 60 * 60 * 24 * 30,
          path: '/',
        };
        if (cookieDomain) cookieOpts.domain = cookieDomain;
        res.cookie('auth_token', token, cookieOpts);
      } catch {}

      return res.json({
        data: {
          ...updatedUser.toObject(),
          token,
        },
        message: "User verified succesfully",
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong" } });
    }
  };

  /**
   * Fetch the authenticated user's profile with counts and subscription details.
   */
  static me = async (req: Request, res: Response): Promise<Response> => {
    const user = req.user as UserInterface | undefined;
    try {
      if (!user?.id) {
        return res.status(401).json({ error: { message: "Unauthorized" } });
      }
      const userId = new mongoose.Types.ObjectId(user.id);

      const [result] = await User.aggregate([
        { $match: { _id: userId } },
        {
          $lookup: {
            from: "files",
            localField: "photoId",
            foreignField: "_id",
            as: "photo",
          },
        },
        {
          $addFields: {
            photo: {
              $cond: {
                if: { $eq: [{ $size: "$photo" }, 0] },
                then: null,
                else: { $arrayElemAt: ["$photo", 0] },
              },
            },
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "coverPhotoId",
            foreignField: "_id",
            as: "coverPhoto",
          },
        },
        {
          $addFields: {
            coverPhoto: {
              $cond: {
                if: { $eq: [{ $size: "$coverPhoto" }, 0] },
                then: null,
                else: { $arrayElemAt: ["$coverPhoto", 0] },
              },
            },
          },
        },
        {
          $lookup: {
            from: "subscriptionplans",
            localField: "_id",
            foreignField: "userId",
            as: "subscriptionPlans",
          },
        },
        {
          $addFields: {
            subscriptionPlans: {
              $filter: {
                input: "$subscriptionPlans",
                as: "plan",
                cond: {
                  $and: [
                    { $eq: ["$$plan.isDeleted", false] },
                    {
                      $or: [
                        {
                          $eq: ["$$plan.planType", SubscriptionPlanType.CUSTOM],
                        },
                        {
                          $eq: ["$$plan.planType", SubscriptionPlanType.FIXED],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $facet: {
            user: [{ $limit: 1 }],
            followersCount: [
              {
                $lookup: {
                  from: "userconnections",
                  let: { userId: "$_id" },
                  pipeline: [
                    {
                      $match: { $expr: { $eq: ["$followingTo", "$$userId"] } },
                    },
                    { $count: "count" },
                  ],
                  as: "followers",
                },
              },
              {
                $addFields: {
                  count: { $arrayElemAt: ["$followers.count", 0] },
                },
              },
            ],
            followingCount: [
              {
                $lookup: {
                  from: "userconnections",
                  let: { userId: "$_id" },
                  pipeline: [
                    { $match: { $expr: { $eq: ["$owner", "$$userId"] } } },
                    { $count: "count" },
                  ],
                  as: "following",
                },
              },
              {
                $addFields: {
                  count: { $arrayElemAt: ["$following.count", 0] },
                },
              },
            ],
            postsCount: [
              {
                $lookup: {
                  from: "posts",
                  let: { userId: "$_id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$user", "$$userId"] },
                            { $eq: ["$isDeleted", false] },
                            { $eq: ["$type", PostType.POST] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "posts",
                },
              },
              {
                $addFields: {
                  count: { $arrayElemAt: ["$posts.count", 0] },
                },
              },
            ],
            likesCount: [
              {
                $lookup: {
                  from: "posts",
                  let: { userId: "$_id" },
                  pipeline: [
                    { $match: { $expr: { $eq: ["$user", "$$userId"] } } },
                    { $project: { _id: 1 } },
                  ],
                  as: "userPosts",
                },
              },
              { $unwind: "$userPosts" },
              {
                $lookup: {
                  from: "interactions",
                  let: { postId: "$userPosts._id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$post", "$$postId"] },
                            { $eq: ["$type", InteractionType.LIKE_POST] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "likes",
                },
              },
              {
                $group: {
                  _id: null,
                  totalLikes: { $sum: { $arrayElemAt: ["$likes.count", 0] } },
                },
              },
              {
                $addFields: {
                  totalLikes: { $ifNull: ["$totalLikes", 0] },
                },
              },
            ],
            subscriberCount: [
              {
                $lookup: {
                  from: "subscriptions",
                  let: { planIds: "$subscriptionPlans._id" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $in: ["$planId", "$$planIds"] },
                            { $eq: ["$status", SubscriptionStatusEnum.ACTIVE] },
                          ],
                        },
                      },
                    },
                    { $count: "count" },
                  ],
                  as: "subscribers",
                },
              },
              {
                $addFields: {
                  count: { $arrayElemAt: ["$subscribers.count", 0] },
                },
              },
            ],
          },
        },
        {
          $project: {
            user: { $arrayElemAt: ["$user", 0] },
            followersCount: {
              $ifNull: [{ $arrayElemAt: ["$followersCount.count", 0] }, 0],
            },
            followingCount: {
              $ifNull: [{ $arrayElemAt: ["$followingCount.count", 0] }, 0],
            },
            postsCount: {
              $ifNull: [{ $arrayElemAt: ["$postsCount.count", 0] }, 0],
            },
            totalLikes: {
              $ifNull: [{ $arrayElemAt: ["$likesCount.totalLikes", 0] }, 0],
            },
            subscriberCount: {
              $ifNull: [{ $arrayElemAt: ["$subscriberCount.count", 0] }, 0],
            },
          },
        },
      ]);

      // get the user platform subscription
      const paidPlanId = (process.env.PLATFORM_SUBSCRIPTION_PLAN_ID || '67648382f267d99e0dc8de11').trim();
      const freePlanId = (process.env.PLATFORM_FREE_SUBSCRIPTION_PLAN_ID || '678a0764e01be7cfa52b9a9c').trim() || paidPlanId;
      const planId = user?.isFreeSubscription ? freePlanId : paidPlanId;
      const subscriptionDetails = await Subscription.findOne({
        userId: user.id,
        planId: planId, //same $20 plan used for all users.
      }).select("-stripeSubscriptionObject");

      if (result && result.user) {
        const userDoc: any = Array.isArray((result as any).user)
          ? (result as any).user[0]
          : (result as any).user;
        const followersCount = Array.isArray((result as any).followersCount)
          ? ((result as any).followersCount[0]?.count || 0)
          : 0;
        const followingCount = Array.isArray((result as any).followingCount)
          ? ((result as any).followingCount[0]?.count || 0)
          : 0;
        const postsCount = Array.isArray((result as any).postsCount)
          ? ((result as any).postsCount[0]?.count || 0)
          : 0;
        const totalLikes = Array.isArray((result as any).likesCount)
          ? ((result as any).likesCount[0]?.totalLikes || 0)
          : 0;
        const subscriberCount = Array.isArray((result as any).subscriberCount)
          ? ((result as any).subscriberCount[0]?.count || 0)
          : 0;

        // Preserve legacy shape (data.user = {...}) to avoid breaking existing clients,
        // but also expose useful fields at top-level for convenience
        const payload: any = {
          user: userDoc || {},
          followersCount,
          followingCount,
          postsCount,
          totalLikes,
          subscriberCount,
          platformSubscription: subscriptionDetails,
        };
        // duplicate some common fields at top level for clients that read data.fullName/userName/photo
        if (userDoc) {
          payload._id = userDoc._id;
          payload.fullName = userDoc.fullName;
          payload.userName = userDoc.userName;
          payload.email = userDoc.email;
          payload.photo = userDoc.photo;
          payload.coverPhoto = userDoc.coverPhoto;
          payload.googleId = userDoc.googleId;
        }
        return res.json({ data: payload });
      }

      return res.status(404).json({ error: { message: "User not found." } });
    } catch (err) {
      console.error(err, "error in retrievng user");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  //Below forget password apis
  /**
   * Send OTP to user's phone for password reset.
   */
  static sendForgotPasswordOtp = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      // Validate input using DTO
      const userInput = plainToClass(UserForgotPasswordDto, req.body);
      const errors = await validate(userInput);

      if (errors.length) {
        const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
          property: error.property,
          constraints: error.constraints,
        }));

        return res
          .status(400)
          .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
      }

      // Check if the user exists
      // Support both two-part and three-part stored formats
      const dial = String(userInput.dialCode || '');
      const num = String(userInput.phoneNumber || '');
      const threePartRegex = new RegExp(`^[A-Za-z]{2}--${dial.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}--${num.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, 'i');
      const user = await User.findOne({
        isDeleted: false,
        $or: [
          { completePhoneNumber: `${dial}--${num}` },
          { completePhoneNumber: { $regex: threePartRegex } },
        ],
      });
      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found with this phone number",
        });
      }

      // Generate OTP and update user
      const otp = otpGenerator();
      const otpInvalidAt = addMinutes(new Date(), 10);

      const updatedData = {
        otp,
        otpInvalidAt,
      };

      await User.findByIdAndUpdate(user.id, updatedData, { new: true });

      // Send OTP via SMS
      await sendMessage(
        `${dial}--${num}`,
        `Your OTP for password reset is: ${otp}`
      );

      return res.status(200).json({
        status: true,
        message: "OTP sent successfully. Please verify within 10 minutes.",
        otp,
      });
    } catch (error) {
      console.error("Error in sending OTP:", error);
      return res.status(500).json({
        status: false,
        message: "Failed to send OTP.",
      });
    }
  };

  /**
   * Validate OTP for password reset flow.
   */
  static validateForgotPasswordOtp = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { dialCode, phoneNumber, otp } = req.body;

      if (!dialCode || !phoneNumber || !otp) {
        return res.status(400).json({
          status: false,
          message: "Phone number, dial code, and OTP are required.",
        });
      }

      const threePartRegex = new RegExp(`^[A-Za-z]{2}--${String(dialCode || '').replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}--${String(phoneNumber || '').replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, 'i');
      const user = await User.findOne({
        isDeleted: false,
        $or: [
          { completePhoneNumber: `${dialCode}--${phoneNumber}` },
          { completePhoneNumber: { $regex: threePartRegex } },
        ],
      });

      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found with this phone number.",
        });
      }

      if (!user.otp || user.otp !== otp.toString()) {
        return res.status(400).json({
          status: false,
          message: "Invalid OTP.",
        });
      }

      if (new Date() > user.otpInvalidAt) {
        return res.status(400).json({
          status: false,
          message: "OTP has expired.",
        });
      }

      return res.status(200).json({
        status: true,
        message: "OTP validated successfully.",
        user: user,
      });
    } catch (error) {
      console.error("Error in validating OTP:", error);
      return res.status(500).json({
        status: false,
        message: "Failed to validate OTP.",
        error: error.message,
      });
    }
  };

  /**
   * Reset user password after OTP validation.
   */
  static resetPassword = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { dialCode, phoneNumber, newPassword, confirmPassword } = req.body;

      // Validate required fields
      if (!dialCode || !phoneNumber || !newPassword || !confirmPassword) {
        return res.status(400).json({
          message:
            "Dial code, phone number, new password, and confirm password are required.",
        });
      }

      // Check if passwords match
      if (newPassword !== confirmPassword) {
        return res
          .status(400)
          .json({ message: "New password and confirm password do not match." });
      }

      const threePartRegex = new RegExp(`^[A-Za-z]{2}--${String(dialCode || '').replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}--${String(phoneNumber || '').replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, 'i');
      const user = await User.findOne({
        isDeleted: false,
        $or: [
          { completePhoneNumber: `${dialCode}--${phoneNumber}` },
          { completePhoneNumber: { $regex: threePartRegex } },
        ],
      });

      // Check if the user exists
      if (!user) {
        return res
          .status(404)
          .json({ message: "User not found with this phone number." });
      }

      const salt = genSaltSync(10);
      const password = newPassword;
      const hashPassword = hashSync(password, salt);
      await User.findOneAndUpdate(
        { _id: user._id, isDeleted: false },
        {
          password: hashPassword,
        },
        {
          new: true,
        }
      );

      return res.status(200).json({ message: "Password reset successfully." });
    } catch (error) {
      console.error("Error in resetting password:", error);
      return res.status(500).json({ message: "Failed to reset password." });
    }
  };
}

export { AuthController };
