import { Request, Response } from "express";
import { User } from "../Models/User";
import { UpdateUserDTO } from "../Inputs/UpdateUser.input";
import { genSaltSync, hashSync } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { validate } from "class-validator";
import { FileEnum } from "../../types/FileEnum";
import { UserInput } from "../Inputs/createUser.input";
import { UserInterface } from "../../types/UserInterface";
import { plainToClass } from "class-transformer";
import { File } from "../Models/File";
import mongoose, { Types } from "mongoose";
import path from "path";
import fs from "fs";
import { userConnection } from "../Models/Connection";
import { Post } from "../Models/Post";
import jwt from "jsonwebtoken";
import { InteractionType } from "../../types/enums/InteractionTypeEnum";
import { GetAllItemsInputs } from "./Posts/Inputs/getPost.input";
import { ValidationErrorResponse } from "../../types/ValidationErrorResponse";
import { commonPaginationPipeline } from "../../utils/pipeline/commonPagination";
import { RolesEnum } from "../../types/RolesEnum";
import {
  default_user_cover,
  default_user_pfp,
} from "../../utils/consts/DefaultUserImages";
import { createCustomerOnStripe } from "../../utils/Webhooks/createCustomerOnStripe";
import { Subscription } from "../Models/Subscription";
import { SubscriptionStatusEnum } from "../../types/enums/SubscriptionStatusEnum";
import { createTipProductOnStripe } from "../../utils/stripe/createTipProductOnStripe";
import { PostType } from "../../types/enums/postTypeEnum";
import { SubscriptionPlanType } from "../../types/enums/subscriptionPlanEnum";
import { userActionType } from "../../types/enums/userActionTypeEnum";
import { MoreAction } from "../Models/MoreAction";
const JWT_SECRET = process.env.JWT_SECRET || "secret_secret";

// Optional S3 support (enabled when MEDIA_STORAGE=s3)
let S3ClientCtor: any;
let GetObjectCommandCtor: any;
let DeleteObjectCommandCtor: any;
let PutObjectCommandCtor: any;
let getSignedUrlFn: any;
try {
  // Dynamic import so build works even without S3 deps locally
  S3ClientCtor = require("@aws-sdk/client-s3").S3Client;
  GetObjectCommandCtor = require("@aws-sdk/client-s3").GetObjectCommand;
  DeleteObjectCommandCtor = require("@aws-sdk/client-s3").DeleteObjectCommand;
  PutObjectCommandCtor = require("@aws-sdk/client-s3").PutObjectCommand;
  getSignedUrlFn = require("@aws-sdk/s3-request-presigner").getSignedUrl;
} catch {}

// import { createCustomerOnStripe } from "../../utils/Webhooks/createCustomerOnStripe";

export class UsersControllers {
  static updateFcmToken = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const user = req.user as UserInterface;
      const { fcm_token } = req.body;
      if (!fcm_token) {
        return res
          .status(400)
          .json({ error: { message: "FCM token is required" } });
      }

      const userWithFcm = await User.findByIdAndUpdate(user.id, {
        fcm_token: fcm_token,
      });

      return res.json({
        data: userWithFcm,
        message: "FCM token updated successfully.",
      });
    } catch (err) {
      console.error(err, "error in fcm token updation");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  // static onboardUser = async (
  //   req: Request,
  //   res: Response
  // ): Promise<Response> => {
  //   try {
  //     const user = req.user as UserInterface;

  //     const userToAddOnboardingDetails = await User.findById(user.id);
  //     if (!userToAddOnboardingDetails) {
  //       return res.status(404).json({ error: { message: "User not found." } });
  //     }

  //     const userInput = req.body as UserInput;
  //     const validationErrors = await validate(userInput);
  //     if (validationErrors.length > 0) {
  //       return res.status(400).json({ errors: validationErrors });
  //     }

  //     const updateData: Partial<UserInterface | any> = { ...userInput };

  //     if (!userInput.coverPhotoId && !user.coverPhotoId) {
  //       updateData.coverPhotoId = default_user_cover;
  //     }

  //     if (
  //       userInput.fullName ||
  //       userInput.userName ||
  //       userInput.email ||
  //       userInput.gender
  //     ) {
  //       updateData.hasPersonalInfo = true;
  //     }
  //     if (userInput.photoId) {
  //       updateData.hasPhotoInfo = true;
  //     } else if (!userInput.photoId && !user.photoId) {
  //       updateData.photoId = default_user_pfp;
  //     }
  //     if (userInput.dob) {
  //       updateData.hasConfirmedAge = true;
  //     }

  //     const newUser = await User.findByIdAndUpdate(
  //       userToAddOnboardingDetails._id,
  //       updateData,
  //       { new: true }
  //     );

  //     if (newUser) {
  //       const paramsToCreateCustomer = {
  //         email: newUser.email,
  //         firstName: newUser.fullName,
  //         userId: newUser.id,
  //       };
  //       try {
  //         createCustomerOnStripe(paramsToCreateCustomer);
  //       } catch (error) {
  //         console.error("Error creating customer on Stripe", error);
  //       }

  //       try {
  //         const stripeTipProduct = await createTipProductOnStripe({
  //           title: `${newUser.userName} + Tip Product`,
  //         });
  //         newUser.stripeProductId = (stripeTipProduct as any)?.id;
  //         newUser.stripeProduct = stripeTipProduct;
  //         await newUser.save();
  //       } catch (error) {
  //         console.error("Error creating user Tip product on Stripe", error);
  //       }
  //     }

  //     return res.json({
  //       data: newUser,
  //       message: "User onboarded successfully.",
  //     });
  //   } catch (err) {
  //     console.error(err, "Error in user onboarding");
  //     return res
  //       .status(500)
  //       .json({ error: { message: "Something went wrong." } });
  //   }
  // };

  static onboardUser = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const user = req.user as UserInterface;
      console.log("[onboardUser] Starting onboarding for user:", user?.id);

      const userToAddOnboardingDetails = await User.findById(user.id);
      if (!userToAddOnboardingDetails) {
        console.error("[onboardUser] User not found:", user.id);
        return res.status(404).json({ error: { message: "User not found." } });
      }

      const userInput = req.body as UserInput;
      console.log("[onboardUser] Received input:", JSON.stringify(userInput, null, 2));
      
      const validationErrors = await validate(userInput);
      if (validationErrors.length > 0) {
        console.error("[onboardUser] Validation errors:", JSON.stringify(validationErrors, null, 2));
        return res.status(400).json({ errors: validationErrors });
      }

      // Check if email is being changed to one that already exists (and it's not the current user's email)
      if (userInput.email && userInput.email !== userToAddOnboardingDetails.email) {
        const existingUserWithEmail = await User.findOne({ email: userInput.email, _id: { $ne: userToAddOnboardingDetails._id } });
        if (existingUserWithEmail) {
          console.error("[onboardUser] Email already in use:", userInput.email);
          return res.status(400).json({ error: { message: "Email is already in use by another account." } });
        }
      }

      // Check if username is being changed to one that already exists
      if (userInput.userName) {
        const escapedUserName = String(userInput.userName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const existingUserWithUsername = await User.findOne({ 
          userName: { $regex: `^${escapedUserName}$`, $options: 'i' },
          _id: { $ne: userToAddOnboardingDetails._id } 
        });
        if (existingUserWithUsername) {
          console.error("[onboardUser] Username already in use:", userInput.userName);
          return res.status(400).json({ error: { message: "Username is already taken. Please choose another." } });
        }
      }

      const updateData: Partial<UserInterface | any> = { ...userInput };

      // Hash the password if it exists in userInput
      if (userInput.password) {
        const salt = genSaltSync(10);
        updateData.password = hashSync(userInput.password, salt);
        console.log("Hashed password is", updateData.password);
      }

      if (!userInput.coverPhotoId && !user.coverPhotoId) {
        updateData.coverPhotoId = default_user_cover;
      }

      if (
        userInput.fullName ||
        userInput.userName ||
        userInput.email ||
        userInput.gender
      ) {
        updateData.hasPersonalInfo = true;
      }
      if (userInput.photoId) {
        updateData.hasPhotoInfo = true;
      } else if (!userInput.photoId && !user.photoId) {
        updateData.photoId = default_user_pfp;
      }
      if (userInput.dob) {
        updateData.hasConfirmedAge = true;
      }

      console.log("[onboardUser] Updating user with data:", JSON.stringify(updateData, null, 2));

      const newUser = await User.findByIdAndUpdate(
        userToAddOnboardingDetails._id,
        updateData,
        { new: true }
      );

      if (!newUser) {
        console.error("[onboardUser] Failed to update user in database");
        return res.status(500).json({ error: { message: "Failed to update user." } });
      }

      console.log("[onboardUser] User updated successfully:", newUser._id);

      if (newUser) {
        const hasStripe = !!process.env.STRIPE_SECRET_KEY;
        if (hasStripe) {
          const paramsToCreateCustomer = {
            email: newUser.email,
            firstName: newUser.fullName,
            userId: newUser.id,
          };
          // Fire-and-forget with safe catch to avoid unhandled rejection crashing the request
          Promise.resolve(createCustomerOnStripe(paramsToCreateCustomer)).catch((error) => {
            console.error("[onboardUser] Error creating customer on Stripe", error);
          });

          try {
            console.log("[onboardUser] Creating Stripe Tip Product for:", newUser.userName);
            const stripeTipProduct = await createTipProductOnStripe({
              title: `${newUser.userName} + Tip Product`,
            });
            if (stripeTipProduct) {
              newUser.stripeProductId = (stripeTipProduct as any)?.id;
              newUser.stripeProduct = stripeTipProduct;
              await newUser.save();
              console.log("[onboardUser] Stripe Tip Product created:", stripeTipProduct.id);
            }
          } catch (error) {
            console.error("[onboardUser] Error creating user Tip product on Stripe", error);
            // Don't fail the whole request if Stripe fails
          }
        }
      }

      return res.json({
        data: newUser,
        message: "User onboarded successfully.",
      });
    } catch (err: any) {
      console.error("[onboardUser] Error in user onboarding:", err);
      console.error("[onboardUser] Error stack:", err?.stack);
      console.error("[onboardUser] Error message:", err?.message);
      
      // Handle MongoDB duplicate key errors specifically
      if (err.code === 11000 || err.codeName === 'DuplicateKey') {
        const field = Object.keys(err.keyValue || {})[0];
        const value = err.keyValue?.[field];
        console.error(`[onboardUser] Duplicate key error: ${field} = ${value}`);
        
        if (field === 'email') {
          return res.status(400).json({ error: { message: "Email is already in use by another account." } });
        } else if (field === 'userName') {
          return res.status(400).json({ error: { message: "Username is already taken. Please choose another." } });
        } else {
          return res.status(400).json({ error: { message: `${field} is already in use.` } });
        }
      }
      
      return res
        .status(500)
        .json({ error: { message: "Something went wrong.", details: err?.message } });
    }
  };

  static fileUpload = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const useS3 = String(process.env.MEDIA_STORAGE || "").toLowerCase() === "s3";
      if (useS3 && S3ClientCtor) {
        const region = process.env.S3_REGION || process.env.AWS_REGION || "eu-north-1";
        const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET as string;
        if (!bucket || !accessKeyId || !secretAccessKey) {
          return res.status(500).json({ error: "S3 is not configured properly." });
        }
        const s3 = new S3ClientCtor({
          region,
          credentials: { accessKeyId, secretAccessKey },
        });
        const safeName = (req.file.originalname || "upload")
          .replace(/[^A-Za-z0-9._-]/g, "_")
          .slice(0, 64);
        const key = `profile-image/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
        await s3.send(new PutObjectCommandCtor({
          Bucket: bucket,
          Key: key,
          Body: (req.file as any).buffer,
          ContentType: (req.file as any).mimetype,
          CacheControl: "public, max-age=31536000, immutable",
        }));
        const file = new File({ path: key });
        const savedFile = await file.save();
        return res.json({ id: savedFile._id, path: savedFile.path });
      } else {
        const file = new File({
          path: `profile-image/${(req.file as any).filename}`,
        });
        const savedFile = await file.save();
        return res.json({
          id: savedFile._id,
          path: savedFile.path,
        });
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      return res
        .status(500)
        .json({ error: "Internal Server Error", message: error.message });
    }
  };

  static getFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ error: "Invalid ID format" });
        return;
      }

      const file = await File.findById(id);
      if (!file) {
        // Fallback: redirect to frontend default avatar to avoid broken UI
        const host = req.get('host');
        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
        res.redirect(302, `${proto}://${host}/assets/images/Home/small-profile-img.svg`);
        return;
      }

      // Try to stream the actual file from disk; fall back to metadata JSON if not found
      const rel = String(file.path || "");
      if (!rel) {
        const host = req.get('host');
        const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
        res.redirect(302, `${proto}://${host}/assets/images/Home/small-profile-img.svg`);
        return;
      }

      // If using S3, redirect to a short-lived signed URL
      const useS3 = String(process.env.MEDIA_STORAGE || "").toLowerCase() === "s3";
      if (useS3 && S3ClientCtor && getSignedUrlFn) {
        try {
          const region = process.env.S3_REGION || process.env.AWS_REGION || "eu-north-1";
          const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
          const secretAccessKey = process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
          const bucket = process.env.S3_BUCKET as string;
          const s3 = new S3ClientCtor({ region, credentials: { accessKeyId, secretAccessKey } });
          const cmd = new GetObjectCommandCtor({ Bucket: bucket, Key: rel });
          const signed = await getSignedUrlFn(s3, cmd, { expiresIn: 60 * 10 }); // 10 minutes
          res.redirect(302, signed);
          return;
        } catch (e) {
          // fall through to local checks if anything goes wrong
        }
      }

      const cleanRel = rel.replace(/^\/+/, '');
      const uploadRoot = process.env.UPLOAD_ROOT
        ? (path.isAbsolute(process.env.UPLOAD_ROOT)
            ? process.env.UPLOAD_ROOT
            : path.join(process.cwd(), process.env.UPLOAD_ROOT))
        : undefined;
      const tryPaths = [
        ...(uploadRoot ? [path.join(uploadRoot, cleanRel)] : []),
        path.join(process.cwd(), 'public', cleanRel),
        // When running from compiled dist, __dirname points to dist/... so one level up is dist/ -> ../public
        path.join(__dirname, '..', 'public', cleanRel),
      ];
      for (const fp of tryPaths) {
        try {
          if (fs.existsSync(fp)) {
            // best-effort content-type
            const ct = rel.toLowerCase().endsWith('.png') ? 'image/png'
              : rel.toLowerCase().match(/\.(jpg|jpeg)$/) ? 'image/jpeg'
              : rel.toLowerCase().endsWith('.webp') ? 'image/webp'
              : rel.toLowerCase().endsWith('.gif') ? 'image/gif'
              : undefined;
            if (ct) res.setHeader('Content-Type', ct);
            // sendFile will handle range headers efficiently
            (res as any).sendFile(fp);
            return;
          }
        } catch {}
      }
      const host = req.get('host');
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      res.redirect(302, `${proto}://${host}/assets/images/Home/small-profile-img.svg`);
      return;
    } catch (error) {
      console.error("Error retrieving file:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
  };

  static deleteFile = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;

      const file = await File.findById(id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const candidates = [
        path.join(process.cwd(), "public", String(file.path || "")),
        path.join(__dirname, "..", "public", String(file.path || "")),
        ...(process.env.UPLOAD_ROOT
          ? [path.join(
              path.isAbsolute(process.env.UPLOAD_ROOT) ? process.env.UPLOAD_ROOT : path.join(process.cwd(), process.env.UPLOAD_ROOT),
              String(file.path || "")
            )]
          : []),
      ];
      let deleted = false;
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            deleted = true;
          }
        } catch {}
        if (deleted) break;
      }

      // Also try deleting from S3 if configured
      const useS3 = String(process.env.MEDIA_STORAGE || "").toLowerCase() === "s3";
      if (!deleted && useS3 && S3ClientCtor) {
        try {
          const region = process.env.S3_REGION || process.env.AWS_REGION || "eu-north-1";
          const accessKeyId = process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
          const secretAccessKey = process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
          const bucket = process.env.S3_BUCKET as string;
          const s3 = new S3ClientCtor({ region, credentials: { accessKeyId, secretAccessKey } });
          await s3.send(new DeleteObjectCommandCtor({ Bucket: bucket, Key: String(file.path || "") }));
          deleted = true;
        } catch {}
      }
      if (!deleted) return res.status(404).json({ error: "File not found on server" });

      file.isDeleted = true;
      file.deletedAt = new Date();
      await file.save();

      return res.json({ message: "File deleted successfully" });
    } catch (error) {
      console.error("Error deleting file:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  //   static create = async (req: Request, res: Response): Promise<Response> => {
  //     const input = req.body;
  //     const registerInput = new RegisterInput();

  //     registerInput.firstName = input.firstName;
  //     registerInput.lastName = input.lastName;
  //     registerInput.email = input.email;
  //     registerInput.phoneNumber = input.phoneNumber;
  //     registerInput.password = input.password;
  //     registerInput.dialCode = input.dialCode;
  //     registerInput.country = input.country;
  //     const errors = await validate(registerInput);

  //     if (errors.length) {
  //       const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
  //         property: error.property,
  //         constraints: error.constraints,
  //       }));

  //       return res
  //         .status(400)
  //         .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
  //     }
  //     try {
  //       const user = await User.findOne({
  //         $or: [
  //           { email: input.email },
  //           {
  //             completePhoneNumber: `${input.country}--${input.dialCode}--${input.phoneNumber}`,
  //           },
  //         ],
  //       });
  //       if (!user) {
  //         const salt = genSaltSync(10);
  //         const hashPassword = hashSync(input.password, salt);
  //         let dataToSave: any = {
  //           firstName: input.firstName,
  //           lastName: input.lastName,
  //           email: input.email,
  //           password: hashPassword,
  //           role: RolesEnum.USER,
  //           phoneNumber: input.phoneNumber,
  //           country: input.country,
  //           dialCode: input.dialCode,
  //           completePhoneNumber: `${input.country}--${input.dialCode}--${input.phoneNumber}`,
  //           isActive: true, //need to delete
  //           isVerified: true, //need to delete
  //         };

  //         if (req.file && req.file?.filename) {
  //           dataToSave.image = `${FileEnum.PROFILEIMAGE}${req.file.filename}`;
  //         }
  //         const userData = await User.create(dataToSave);
  //         return res.json({
  //           data: {
  //             user: {
  //               _id: userData.id,
  //               firstName: userData.firstName,
  //               lastName: userData.lastName,
  //               email: userData.email,
  //               role: userData.role,
  //               lastLogin: userData.lastLogin,
  //               image: userData.image,
  //               phoneNumber: userData.phoneNumber,
  //               country: userData.country,
  //               dialCode: userData.dialCode,
  //             },
  //           },
  //         });
  //       } else {
  //         return res
  //           .status(400)
  //           .json({
  //             data: {
  //               message: "User already exists with same email or phone number.",
  //             },
  //           });
  //       }
  //     } catch (error) {
  //       return res
  //         .status(500)
  //         .json({ error: { message: "Something went wrong." } });
  //     }
  //   };

  static checkUsernameAvailability = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { username } = req.query;

      if (!username) {
        return res
          .status(400)
          .json({ error: { message: "Username is required." } });
      }
      const escaped = String(username).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const user = await User.findOne({ userName: { $regex: `^${escaped}$`, $options: 'i' } });

      if (user) {
        return res.json({ isAvailable: false });
      } else {
        return res.json({ isAvailable: true });
      }
    } catch (err) {
      console.error(err, "Error in checking userName availability");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static create = async (req: Request, res: Response): Promise<Response> => {
    try {
      // const userInput = req.body as UserInput;
      const userInput = plainToClass(UserInput, req.body) as UserInput;

      const validationErrors = await validate(userInput);
      if (validationErrors.length > 0) {
        return res.status(400).json({ errors: validationErrors });
      }

      const updateData: Partial<UserInterface | any> = { ...userInput };

      if (!req.body.coverPhotoId) {
        updateData.coverPhotoId = default_user_cover;
      }

      if (
        userInput.fullName ||
        userInput.userName ||
        userInput.email ||
        userInput.gender
      ) {
        updateData.hasPersonalInfo = true;
      }
      if (userInput.photoId) {
        updateData.hasPhotoInfo = true;
      } else {
        updateData.photoId = default_user_pfp;
      }
      if (userInput.dob) {
        updateData.hasConfirmedAge = true;
      }

      const newUser = new User(updateData);
      await newUser.save();

      return res.json({ data: newUser, message: "User created successfully." });
    } catch (err) {
      console.error(err, "error in user creation");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static index = async (_req: any, res: Response): Promise<Response> => {
    try {
      const userQuery: any = plainToClass(GetAllItemsInputs, _req.query);
      const user: UserInterface = _req.user as UserInterface;
      const errors = await validate(userQuery);
      if (errors.length) {
        const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
          property: error.property,
          constraints: error.constraints,
        }));

        return res
          .status(400)
          .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
      }

      const { perPage, page, search, filter } = userQuery;
      let skip =
        ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);
      let matchCondition: any = {
        role: RolesEnum.USER,
        isDeleted: false,
        // isActive: true,
      };
      if (search) {
        matchCondition = {
          ...matchCondition,
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { userName: { $regex: search, $options: "i" } },
          ],
        };
      }
      if (filter === "mentors") {
        matchCondition = {
          ...matchCondition,
          isMentor: true,
          hasDocumentVerified: true,
        };
      }
      const reportedUsers = await MoreAction.find({
        actionByUser: user?._id,
        actionType: userActionType.REPORT,
      })
        .select("actionToUser")
        .lean();

      const reportedUserIds = reportedUsers?.map((ru) => ru.actionToUser);

      if (reportedUserIds?.length > 0) {
        matchCondition._id = { $nin: reportedUserIds };
      }
      const query = await User.aggregate([
        { $match: matchCondition },

        // {
        // $facet: {
        // results: [
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
            as: "coverphoto",
          },
        },
        {
          $addFields: {
            coverPhoto: {
              $cond: {
                if: { $eq: [{ $size: "$coverphoto" }, 0] },
                then: null,
                else: { $arrayElemAt: ["$coverphoto", 0] },
              },
            },
          },
        },
        {
          $lookup: {
            from: "userconnections",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$followingTo", "$$userId"] },
                      { $eq: ["$owner", new Types.ObjectId(user._id)] },
                    ],
                  },
                },
              },
            ],
            as: "followInfo",
          },
        },
        {
          $addFields: {
            isFollowing: { $gt: [{ $size: "$followInfo" }, 0] },
          },
        },
        {
          $unset: "followInfo",
        },

        {
          $lookup: {
            from: "subscriptionplans",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$userId", "$$userId"] },
                      {
                        $in: [
                          "$planType",
                          [
                            SubscriptionPlanType.CUSTOM,
                            SubscriptionPlanType.FIXED,
                          ],
                        ],
                      },
                    ],
                  },
                },
              },
            ],
            as: "planInfo",
          },
        },

        {
          $lookup: {
            from: "subscriptions",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$userId", "$$userId"],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  status: 1, // Include only the subscription status
                },
              },
            ],
            as: "subscriptions",
          },
        },
        {
          $addFields: {
            hasPlan: { $gt: [{ $size: "$planInfo" }, 0] },
          },
        },
        {
          $unset: "planInfo",
        },
        // ],
        // userCount: [{ $match: dataToFind }, { $count: "count" }],
        // },
        // },
        ...commonPaginationPipeline(page as number, perPage as number, skip),
      ]);

      let data = {
        data: query[0]?.data ?? [],
        meta: query[0]?.metaData?.[0] ?? {},
      };
      return res.json(data);

      // const userCount = query.userCount[0]?.count || 0;
      // const totalPages = Math.ceil(userCount / perPage);

      // return res.json({
      //   data: query.results,
      //   meta: {
      //     perPage: perPage,
      //     page: _req.query.page || 1,
      //     pages: totalPages,
      //     total: userCount,
      //   },
      // });
    } catch (err) {
      console.log(err, "Error in getting users");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static show = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;

    try {
      const user = await User.findById(id, "-password -__v");

      if (user) {
        return res.json({ data: user });
      }

      return res.status(404).json({ error: { message: "User not found." } });
    } catch (err) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static update = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const input: UpdateUserDTO = req.body;
    if (input.password) {
      // @ts-ignore
      delete input.password;
    }
    try {
      const checkUser = await User.findById(id);

      if (!checkUser) {
        return res
          .status(404)
          .json({ error: { message: "User to update does not exists." } });
      }
      const user = await User.findByIdAndUpdate(
        id,
        {
          ...input,
          image: (req.file || {}).filename
            ? `${FileEnum.PROFILEIMAGE}${req?.file?.filename}`
            : checkUser.photoId,
        },
        {
          new: true,
        }
      );

      if (!user) {
        return res
          .status(400)
          .json({ error: { message: "User to update does not exists." } });
      }

      return res.json({ data: user });
    } catch (err) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static destroy = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;

    try {
      const user = await User.findByIdAndUpdate(id, {
        isDeleted: true,
        deletedAt: new Date(),
      });

      if (!user) {
        return res
          .status(400)
          .json({ error: { message: "User to delete does not exists." } });
      }

      return res.json({ message: "User deleted successfully." });
    } catch (err) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static isUserPhotoSkipped = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const user = req.user as UserInterface;
    try {
      if (!req.body.isPhotoSkipped === true) {
        return res.json({ message: "Invalid Request body." });
      }

      const userToUpdate = await User.findByIdAndUpdate(
        user.id,
        {
          hasPhotoInfo: true,
        },
        {
          new: true,
        }
      );

      return res.json({
        data: userToUpdate,
        message: "User updated successfully.",
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static downloadDocument = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const { id } = req.params;
      const file = await File.findById(id);
      if (!file) {
        return res.status(404).json({ error: "File Not found" });
      }

      return fs.readFile(`public/${file?.path}`, (err, data) => {
        if (err) {
          console.log("Error in downloading document", err);
          return res.status(404).json({ error: "Something went wrong." });
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${id}`);
        return res.send(data);
      });
    } catch (error) {
      console.error("Error in downloading document:", error);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };

  static findUserByUserName = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { userName } = req.query;

      if (!userName) {
        return res
          .status(400)
          .json({ error: "userName query parameter is required." });
      }

      // Find by username (case-insensitive) OR by ObjectId (if valid). This makes profile URLs more robust.
      const escaped = String(userName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const or: any[] = [ { userName: { $regex: `^${escaped}$`, $options: 'i' } } ];
      if (Types.ObjectId.isValid(String(userName))) {
        or.push({ _id: new Types.ObjectId(String(userName)) });
      }
      let user = await User.findOne({ $or: or }).populate("photoId");

      // As a last resort in dev, allow falling back to the current session user to avoid hard 404s
      if (!user && (req as any).session?.user?.id) {
        try { user = await User.findById((req as any).session.user.id).populate('photoId'); } catch {}
      }
      if (!user) return res.status(404).json({ error: "User not found." });

      let isFollowing = false;
      const authHeader = req.headers.authorization;
      if (!process.env.APP_SECRET) {
      }
      let loggedInUser;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
          const decodedToken = jwt.verify(token, JWT_SECRET) as unknown as {
            id: string;
          };

          loggedInUser = await User.findById(decodedToken.id);
          if (loggedInUser) {
            isFollowing =
              (await userConnection
                .findOne({
                  owner: loggedInUser._id,
                  followingTo: user._id,
                })
                .lean()) !== null;
          }
        } catch (error) {
          console.error("Token verification failed:", error);
        }
      }

      // const subscriptionPlans = await SubscriptionPlan.find({
      //   userId: user._id,
      //   isDeleted: false,
      // }).lean();

      const userId = user._id;
      const [result] = await User.aggregate([
        { $match: { _id: new Types.ObjectId(userId) } },
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
            photo: { $arrayElemAt: ["$photo", 0] },
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
            coverPhoto: { $arrayElemAt: ["$coverPhoto", 0] },
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
                cond: { $eq: ["$$plan.isDeleted", false] },
              },
            },
          },
        },
        {
          $lookup: {
            from: "features",
            localField: "subscriptionPlans.featureIds",
            foreignField: "_id",
            as: "featureObjects",
          },
        },
        {
          $addFields: {
            "subscriptionPlans.featureIds": "$featureObjects",
          },
        },
        {
          $project: {
            featureObjects: 0,
          },
        },
        {
          $lookup: {
            from: "subscriptions",
            let: { userId: new Types.ObjectId(userId) },
            pipeline: [
              { $match: { $expr: { $eq: ["$userId", "$$userId"] } } },
              { $project: { planId: 1, _id: 0 } },
            ],
            as: "userSubscriptions",
          },
        },
        {
          $addFields: {
            subscriptionPlans: {
              $map: {
                input: "$subscriptionPlans",
                as: "plan",
                in: {
                  $mergeObjects: [
                    "$$plan",
                    {
                      isJoined: {
                        $in: ["$$plan._id", "$userSubscriptions.planId"],
                      },
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
                      $match: {
                        $expr: { $eq: ["$followingTo", "$$userId"] },
                      },
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
                            { $eq: ["$isDeleted", false] },
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

      if (loggedInUser) {
        const userSubscriptions = await Subscription.find({
          userId: loggedInUser.id,
          status: SubscriptionStatusEnum.ACTIVE,
        });

        const subscribedPlanIds = userSubscriptions.map((sub) =>
          sub.planId?.toString()
        );

        result.user.subscriptionPlans = result.user.subscriptionPlans.map(
          (plan: any) => ({
            ...plan,
            isJoined: subscribedPlanIds.includes(plan._id.toString()),
          })
        );
      }

      const posts = await Post.aggregate([
        { $match: { user: user._id } },
        { $unwind: "$media" },
        {
          $lookup: {
            from: "files",
            localField: "media.mediaId",
            foreignField: "_id",
            as: "mediaFiles",
          },
        },
        { $unwind: "$mediaFiles" },

        {
          $group: {
            _id: "$_id",
            media: { $push: "$media" },
            content: { $first: "$content" },
            tags: { $first: "$tags" },
            privacy: { $first: "$privacy" },
            status: { $first: "$status" },
            user: { $first: "$user" },
            isActive: { $first: "$isActive" },
            isDeleted: { $first: "$isDeleted" },
            createdAt: { $first: "$createdAt" },
            updatedAt: { $first: "$updatedAt" },
            __v: { $first: "$__v" },
            mediaFiles: { $push: "$mediaFiles" },
          },
        },
      ]);

      return res.status(200).json({
        data: {
          ...user.toObject(),
          isFollowing,
          subscriptionPlans: result.user.subscriptionPlans,
          posts,
          photoId: user.photoId?.id,
          photo: result.user.photo,
          coverPhoto: result.user.coverPhoto,
          followersCount: result.followersCount,
          followingCount: result.followingCount,
          postsCount: result.postsCount,
          totalLikes: result.totalLikes,
          subscriberCount: result.subscriberCount,
        },
      });
    } catch (error) {
      console.error("Error in finding user by username", error);
      return res.status(500).json({ error: "Something went wrong." });
    }
  };

  static makeUserSubscriptionActive = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const { id } = req.params;

    try {
      const checkUser = await User.findById(id);

      if (!checkUser) {
        return res
          .status(404)
          .json({ error: { message: "User to update does not exists." } });
      }
      const user = await User.findByIdAndUpdate(
        id,
        {
          isFreeSubscription: true,
        },
        {
          new: true,
        }
      );

      const subscription = await this.grantFreeSubscription(
        id,
        "678a0764e01be7cfa52b9a9c"
      );

      if (!user) {
        return res
          .status(400)
          .json({ error: { message: "User to update does not exists." } });
      }

      return res.json({ data: user, subscription });
    } catch (err) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  static grantFreeSubscription = async (
    userId: String,
    freePlanId: String
  ): Promise<any> => {
    try {
      const now = new Date();
      const endDate = new Date();
      endDate.setMonth(now.getMonth() + 1);

      const freeSubscription = new Subscription({
        userId,
        planId: freePlanId,
        StripeSubscriptionId: uuidv4(),
        StripePriceId: uuidv4(),
        status: "active",
        startDate: now,
        endDate: endDate,
      });
      const savedSubscription = await freeSubscription.save();

      console.log("Saved subscription...", savedSubscription);
      return savedSubscription;
    } catch (error) {
      console.log("erro...", error);
    }
  };

  static updateUserStatus = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;
      const { status } = req.query;

      // Validate the `status` query parameter
      if (!status || (status !== "active" && status !== "inactive")) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Use 'active' or 'inactive'.",
        });
      }

      // Find the user by ID
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      // Update the `isActive` field based on the `status`
      user.isActive = status === "active";
      await user.save();

      return res.status(200).json({
        success: true,
        message: `User status updated to ${status}.`,
        data: {
          userId: user.id,
          isActive: user.isActive,
        },
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating user status.",
      });
    }
  };
}

