import { Request, Response } from "express";
import {
  db,
  Tables,
  findById,
  insertOne,
  updateById,
  count,
  toSnakeCase,
} from "../../lib/db";
import { UpdateUserDTO } from "../Inputs/UpdateUser.input";
import { genSaltSync, hashSync } from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { validate } from "class-validator";
import { FileEnum } from "../../types/FileEnum";
import { UserInput } from "../Inputs/createUser.input";
import { UserInterface } from "../../types/UserInterface";
import { plainToClass } from "class-transformer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { InteractionType } from "../../types/enums/InteractionTypeEnum";
import { GetAllItemsInputs } from "./Posts/Inputs/getPost.input";
import { ValidationErrorResponse } from "../../types/ValidationErrorResponse";
import { RolesEnum } from "../../types/RolesEnum";
import {
  default_user_cover,
  default_user_pfp,
} from "../../utils/consts/DefaultUserImages";
import { createCustomerOnStripe } from "../../utils/Webhooks/createCustomerOnStripe";
import { SubscriptionStatusEnum } from "../../types/enums/SubscriptionStatusEnum";
import { createTipProductOnStripe } from "../../utils/stripe/createTipProductOnStripe";
import { PostType } from "../../types/enums/postTypeEnum";
import { SubscriptionPlanType } from "../../types/enums/subscriptionPlanEnum";
import { userActionType } from "../../types/enums/userActionTypeEnum";
const JWT_SECRET = process.env.JWT_SECRET || "secret_secret";

// Optional S3 support (enabled when MEDIA_STORAGE=s3) – kept for getFile/deleteFile legacy paths
let S3ClientCtor: any;
let GetObjectCommandCtor: any;
let DeleteObjectCommandCtor: any;
let getSignedUrlFn: any;
try {
  S3ClientCtor = require("@aws-sdk/client-s3").S3Client;
  GetObjectCommandCtor = require("@aws-sdk/client-s3").GetObjectCommand;
  DeleteObjectCommandCtor = require("@aws-sdk/client-s3").DeleteObjectCommand;
  getSignedUrlFn = require("@aws-sdk/s3-request-presigner").getSignedUrl;
} catch {}

/** Simple UUID v4 format check (replaces mongoose.Types.ObjectId.isValid) */
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str
  );
}

export class UsersControllers {
  /* ── FCM Token ──────────────────────────────────────────────────────── */
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

      const userWithFcm = await updateById(Tables.USERS, (user as any).id, {
        fcm_token,
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

  /* ── Onboard User ──────────────────────────────────────────────────── */
  static onboardUser = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const user = req.user as UserInterface;
      const userId = (user as any).id;
      console.log("[onboardUser] Starting onboarding for user:", userId);

      const existingUser = await findById(Tables.USERS, userId);
      if (!existingUser) {
        console.error("[onboardUser] User not found:", userId);
        return res
          .status(404)
          .json({ error: { message: "User not found." } });
      }

      const userInput = plainToClass(UserInput, req.body);
      console.log(
        "[onboardUser] Received input:",
        JSON.stringify(req.body, null, 2)
      );

      const validationErrors = await validate(userInput);
      if (validationErrors.length > 0) {
        console.error(
          "[onboardUser] Validation errors:",
          JSON.stringify(validationErrors, null, 2)
        );
        return res.status(400).json({
          error: { message: "Validation failed", details: validationErrors.map(e => ({ property: e.property, constraints: e.constraints })) },
          errors: validationErrors,
        });
      }

      // Check if email is being changed to one that already exists
      if (userInput.email && userInput.email !== existingUser.email) {
        const { data: existingWithEmail } = await db
          .from(Tables.USERS)
          .select("id")
          .eq("email", userInput.email)
          .neq("id", userId)
          .maybeSingle();

        if (existingWithEmail) {
          console.error("[onboardUser] Email already in use:", userInput.email);
          return res.status(400).json({
            error: {
              message: "Email is already in use by another account.",
            },
          });
        }
      }

      // Check if username is being changed to one that already exists
      if (userInput.userName) {
        const { data: existingWithUsername } = await db
          .from(Tables.USERS)
          .select("id")
          .ilike("user_name", userInput.userName)
          .neq("id", userId)
          .maybeSingle();

        if (existingWithUsername) {
          console.error(
            "[onboardUser] Username already in use:",
            userInput.userName
          );
          return res.status(400).json({
            error: {
              message: "Username is already taken. Please choose another.",
            },
          });
        }
      }

      // Build update data in snake_case
      const updateData: Record<string, any> = toSnakeCase({ ...userInput });

      // Hash password if provided
      if (userInput.password) {
        const salt = genSaltSync(10);
        updateData.password = hashSync(userInput.password, salt);
        console.log("Hashed password is", updateData.password);
      }

      if (!userInput.coverPhotoId && !existingUser.cover_photo_id && default_user_cover) {
        updateData.cover_photo_id = default_user_cover;
      }

      if (
        userInput.fullName ||
        userInput.userName ||
        userInput.email ||
        userInput.gender
      ) {
        updateData.has_personal_info = true;
      }
      if (userInput.photoId) {
        updateData.has_photo_info = true;
      } else if (!userInput.photoId && !existingUser.photo_id && default_user_pfp) {
        updateData.photo_id = default_user_pfp;
      }
      if (userInput.dob) {
        updateData.has_confirmed_age = true;
      }

      console.log(
        "[onboardUser] Updating user with data:",
        JSON.stringify(updateData, null, 2)
      );

      let newUser = await updateById(Tables.USERS, userId, updateData);

      if (!newUser) {
        console.error("[onboardUser] Failed to update user in database");
        return res
          .status(500)
          .json({ error: { message: "Failed to update user." } });
      }

      console.log("[onboardUser] User updated successfully:", newUser.id);

      // Stripe integration
      const hasStripe = !!process.env.STRIPE_SECRET_KEY;
      if (hasStripe) {
        const paramsToCreateCustomer = {
          email: newUser.email,
          firstName: newUser.full_name,
          userId: newUser.id,
        };
        // Fire-and-forget with safe catch
        Promise.resolve(
          createCustomerOnStripe(paramsToCreateCustomer)
        ).catch((error) => {
          console.error(
            "[onboardUser] Error creating customer on Stripe",
            error
          );
        });

        try {
          console.log(
            "[onboardUser] Creating Stripe Tip Product for:",
            newUser.user_name
          );
          const stripeTipProduct = await createTipProductOnStripe({
            title: `${newUser.user_name} + Tip Product`,
          });
          if (stripeTipProduct) {
            const stripeUpdate = await updateById(Tables.USERS, newUser.id, {
              stripe_product_id: (stripeTipProduct as any)?.id,
              stripe_product: stripeTipProduct,
            });
            if (stripeUpdate) newUser = stripeUpdate;
            console.log(
              "[onboardUser] Stripe Tip Product created:",
              (stripeTipProduct as any).id
            );
          }
        } catch (error) {
          console.error(
            "[onboardUser] Error creating user Tip product on Stripe",
            error
          );
          // Don't fail the whole request if Stripe fails
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

      // Handle PostgreSQL unique constraint violations (replaces MongoDB duplicate key check)
      if (err?.code === "23505") {
        const detail = err?.detail || "";
        if (detail.includes("email")) {
          return res.status(400).json({
            error: {
              message: "Email is already in use by another account.",
            },
          });
        } else if (detail.includes("user_name")) {
          return res.status(400).json({
            error: {
              message: "Username is already taken. Please choose another.",
            },
          });
        } else {
          return res.status(400).json({
            error: { message: "A unique constraint was violated." },
          });
        }
      }

      return res.status(500).json({
        error: {
          message: "Something went wrong.",
          details: err?.message,
        },
      });
    }
  };

  /* ── File Upload ────────────────────────────────────────────────────── */
  static fileUpload = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Upload to Supabase Storage (avatars bucket for profile images)
      const { v4: uuidv4 } = await import("uuid");
      const { supabaseAdmin } = await import("../../lib/supabase");
      const ext = (req.file.originalname || "upload").split(".").pop() || "bin";
      const storagePath = `${uuidv4()}.${ext}`;
      const bucket = "avatars";

      console.log("[fileUpload] Uploading to Supabase Storage bucket:", bucket, "path:", storagePath);

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(bucket)
        .upload(storagePath, (req.file as any).buffer, {
          contentType: (req.file as any).mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error("[fileUpload] Supabase Storage upload error:", uploadError.message);
        return res.status(500).json({ error: "File upload failed", message: uploadError.message });
      }

      // Get public URL
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(uploadData.path);

      console.log("[fileUpload] Upload success, publicUrl:", publicUrl);

      // Save file record in database
      const savedFile = await insertOne(Tables.FILES, {
        path: publicUrl,
      });
      if (!savedFile) {
        return res
          .status(500)
          .json({ error: "Failed to save file record" });
      }
      return res.json({
        id: savedFile.id,
        path: savedFile.path,
        publicUrl,
      });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      return res
        .status(500)
        .json({ error: "Internal Server Error", message: error.message });
    }
  };

  /* ── Get File ───────────────────────────────────────────────────────── */
  static getFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!isValidUUID(id)) {
        res.status(400).json({ error: "Invalid ID format" });
        return;
      }

      const file = await findById(Tables.FILES, id);
      if (!file) {
        const host = req.get("host");
        const proto =
          (req.headers["x-forwarded-proto"] as string) ||
          req.protocol ||
          "https";
        res.redirect(
          302,
          `${proto}://${host}/assets/images/Home/small-profile-img.svg`
        );
        return;
      }

      const rel = String(file.path || "");
      if (!rel) {
        const host = req.get("host");
        const proto =
          (req.headers["x-forwarded-proto"] as string) ||
          req.protocol ||
          "https";
        res.redirect(
          302,
          `${proto}://${host}/assets/images/Home/small-profile-img.svg`
        );
        return;
      }

      // If path is already a full URL (e.g. Supabase Storage), redirect directly
      if (rel.startsWith("http://") || rel.startsWith("https://")) {
        res.redirect(302, rel);
        return;
      }

      // If using S3, redirect to a short-lived signed URL
      const useS3 =
        String(process.env.MEDIA_STORAGE || "").toLowerCase() === "s3";
      if (useS3 && S3ClientCtor && getSignedUrlFn) {
        try {
          const region =
            process.env.S3_REGION || process.env.AWS_REGION || "eu-north-1";
          const accessKeyId =
            process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
          const secretAccessKey =
            process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
          const bucket = process.env.S3_BUCKET as string;
          const s3 = new S3ClientCtor({
            region,
            credentials: { accessKeyId, secretAccessKey },
          });
          const cmd = new GetObjectCommandCtor({ Bucket: bucket, Key: rel });
          const signed = await getSignedUrlFn(s3, cmd, {
            expiresIn: 60 * 10,
          }); // 10 minutes
          res.redirect(302, signed);
          return;
        } catch (e) {
          // fall through to local checks if anything goes wrong
        }
      }

      const cleanRel = rel.replace(/^\/+/, "");
      const uploadRoot = process.env.UPLOAD_ROOT
        ? path.isAbsolute(process.env.UPLOAD_ROOT)
          ? process.env.UPLOAD_ROOT
          : path.join(process.cwd(), process.env.UPLOAD_ROOT)
        : undefined;
      const tryPaths = [
        ...(uploadRoot ? [path.join(uploadRoot, cleanRel)] : []),
        path.join(process.cwd(), "public", cleanRel),
        path.join(__dirname, "..", "public", cleanRel),
      ];
      for (const fp of tryPaths) {
        try {
          if (fs.existsSync(fp)) {
            const ct = rel.toLowerCase().endsWith(".png")
              ? "image/png"
              : rel.toLowerCase().match(/\.(jpg|jpeg)$/)
                ? "image/jpeg"
                : rel.toLowerCase().endsWith(".webp")
                  ? "image/webp"
                  : rel.toLowerCase().endsWith(".gif")
                    ? "image/gif"
                    : undefined;
            if (ct) res.setHeader("Content-Type", ct);
            (res as any).sendFile(fp);
            return;
          }
        } catch {}
      }
      const host = req.get("host");
      const proto =
        (req.headers["x-forwarded-proto"] as string) ||
        req.protocol ||
        "https";
      res.redirect(
        302,
        `${proto}://${host}/assets/images/Home/small-profile-img.svg`
      );
      return;
    } catch (error) {
      console.error("Error retrieving file:", error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
  };

  /* ── Delete File ────────────────────────────────────────────────────── */
  static deleteFile = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    try {
      const { id } = req.params;

      const file = await findById(Tables.FILES, id);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      const candidates = [
        path.join(process.cwd(), "public", String(file.path || "")),
        path.join(__dirname, "..", "public", String(file.path || "")),
        ...(process.env.UPLOAD_ROOT
          ? [
              path.join(
                path.isAbsolute(process.env.UPLOAD_ROOT)
                  ? process.env.UPLOAD_ROOT
                  : path.join(process.cwd(), process.env.UPLOAD_ROOT),
                String(file.path || "")
              ),
            ]
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
      const useS3 =
        String(process.env.MEDIA_STORAGE || "").toLowerCase() === "s3";
      if (!deleted && useS3 && S3ClientCtor) {
        try {
          const region =
            process.env.S3_REGION || process.env.AWS_REGION || "eu-north-1";
          const accessKeyId =
            process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
          const secretAccessKey =
            process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
          const bucket = process.env.S3_BUCKET as string;
          const s3 = new S3ClientCtor({
            region,
            credentials: { accessKeyId, secretAccessKey },
          });
          await s3.send(
            new DeleteObjectCommandCtor({
              Bucket: bucket,
              Key: String(file.path || ""),
            })
          );
          deleted = true;
        } catch {}
      }
      if (!deleted)
        return res.status(404).json({ error: "File not found on server" });

      // Soft-delete the file record in Supabase
      await updateById(Tables.FILES, id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      });

      return res.json({ message: "File deleted successfully" });
    } catch (error) {
      console.error("Error deleting file:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  /* ── Check Username Availability ────────────────────────────────────── */
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

      const { data: user } = await db
        .from(Tables.USERS)
        .select("id")
        .ilike("user_name", String(username))
        .maybeSingle();

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

  /* ── Create User ────────────────────────────────────────────────────── */
  static create = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userInput = plainToClass(UserInput, req.body) as UserInput;

      const validationErrors = await validate(userInput);
      if (validationErrors.length > 0) {
        return res.status(400).json({ errors: validationErrors });
      }

      const updateData: Record<string, any> = toSnakeCase({ ...userInput });

      if (!req.body.coverPhotoId && default_user_cover) {
        updateData.cover_photo_id = default_user_cover;
      }

      if (
        userInput.fullName ||
        userInput.userName ||
        userInput.email ||
        userInput.gender
      ) {
        updateData.has_personal_info = true;
      }
      if (userInput.photoId) {
        updateData.has_photo_info = true;
      } else if (default_user_pfp) {
        updateData.photo_id = default_user_pfp;
      }
      if (userInput.dob) {
        updateData.has_confirmed_age = true;
      }

      const newUser = await insertOne(Tables.USERS, updateData);

      return res.json({
        data: newUser,
        message: "User created successfully.",
      });
    } catch (err) {
      console.error(err, "error in user creation");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  /* ── Index (List Users with pagination) ─────────────────────────────── */
  static index = async (_req: any, res: Response): Promise<Response> => {
    try {
      const userQuery: any = plainToClass(GetAllItemsInputs, _req.query);
      const user: UserInterface = _req.user as UserInterface;
      const currentUserId = (user as any).id;
      const errors = await validate(userQuery);
      if (errors.length) {
        const errorsInfo: ValidationErrorResponse[] = errors.map(
          (error: any) => ({
            property: error.property,
            constraints: error.constraints,
          })
        );

        return res
          .status(400)
          .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
      }

      const { perPage, page, search, filter } = userQuery;
      const pageNum = (page as number) > 0 ? (page as number) : 1;
      const limit = (perPage as number) || 20;
      const offset = (pageNum - 1) * limit;

      // 1. Get reported user IDs to exclude
      const { data: reportedUsers } = await db
        .from(Tables.MORE_ACTIONS)
        .select("action_to_user")
        .eq("action_by_user", currentUserId)
        .eq("action_type", userActionType.REPORT);

      const reportedUserIds = (reportedUsers || []).map(
        (ru: any) => ru.action_to_user
      );

      // 2. Build main users query
      const isAdmin = (user as any).role === RolesEnum.ADMIN;
      let query = db
        .from(Tables.USERS)
        .select("*", { count: "exact" })
        .eq("is_deleted", false);

      // Non-admin users only see other regular users
      if (!isAdmin) {
        query = query.eq("role", RolesEnum.USER);
      }

      if (search) {
        query = query.or(
          `full_name.ilike.%${search}%,user_name.ilike.%${search}%`
        );
      }

      if (filter === "mentors") {
        query = query
          .eq("is_mentor", true)
          .eq("has_document_verified", true);
      }

      if (reportedUserIds.length > 0) {
        query = query.not(
          "id",
          "in",
          `(${reportedUserIds.join(",")})`
        );
      }

      query = query.range(offset, offset + limit - 1);

      const { data: users, count: total } = await query;

      if (!users || users.length === 0) {
        return res.json({
          data: [],
          meta: {
            total: 0,
            page: pageNum,
            perPage: limit,
            pageCount: 0,
          },
        });
      }

      // 3. Batch-fetch related data
      const userIds = users.map((u: any) => u.id);
      const photoIds = users
        .map((u: any) => u.photo_id)
        .filter(Boolean);
      const coverPhotoIds = users
        .map((u: any) => u.cover_photo_id)
        .filter(Boolean);
      const allFileIds = [...new Set([...photoIds, ...coverPhotoIds])];

      // Fetch files (photos and cover photos)
      let filesMap: Record<string, any> = {};
      if (allFileIds.length > 0) {
        const { data: files } = await db
          .from(Tables.FILES)
          .select("*")
          .in("id", allFileIds);
        if (files) {
          filesMap = Object.fromEntries(
            files.map((f: any) => [f.id, f])
          );
        }
      }

      // Check following status for current user
      const { data: followings } = await db
        .from(Tables.USER_CONNECTIONS)
        .select("following_to")
        .eq("owner", currentUserId)
        .in("following_to", userIds);

      const followingSet = new Set(
        (followings || []).map((f: any) => f.following_to)
      );

      // Fetch subscription plan info
      const { data: subPlans } = await db
        .from(Tables.SUBSCRIPTION_PLANS)
        .select("user_id")
        .in("user_id", userIds)
        .in("plan_type", [
          SubscriptionPlanType.CUSTOM,
          SubscriptionPlanType.FIXED,
        ]);

      const usersWithPlans = new Set(
        (subPlans || []).map((sp: any) => sp.user_id)
      );

      // Fetch subscription statuses
      const { data: subs } = await db
        .from(Tables.SUBSCRIPTIONS)
        .select("user_id, status")
        .in("user_id", userIds);

      const userSubscriptionsMap: Record<string, any[]> = {};
      (subs || []).forEach((s: any) => {
        if (!userSubscriptionsMap[s.user_id])
          userSubscriptionsMap[s.user_id] = [];
        userSubscriptionsMap[s.user_id].push({ status: s.status });
      });

      // 4. Assemble enriched results with camelCase keys for frontend
      const enrichedUsers = users.map((u: any) => ({
        // Keep raw snake_case fields
        ...u,
        // Add camelCase aliases expected by frontend
        _id: u.id,
        fullName: u.full_name,
        userName: u.user_name,
        firstName: u.first_name,
        lastName: u.last_name,
        phoneNumber: u.phone_number,
        dialCode: u.dial_code,
        completePhoneNumber: u.complete_phone_number,
        photoId: u.photo_id,
        coverPhotoId: u.cover_photo_id,
        isActive: u.is_active,
        isDeleted: u.is_deleted,
        isMentor: u.is_mentor,
        isVerified: u.is_verified,
        hasPersonalInfo: u.has_personal_info,
        hasPhotoInfo: u.has_photo_info,
        hasConfirmedAge: u.has_confirmed_age,
        hasDocumentVerified: u.has_document_verified,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        // Enriched fields
        photo: filesMap[u.photo_id] || null,
        coverPhoto: filesMap[u.cover_photo_id] || null,
        isFollowing: followingSet.has(u.id),
        hasPlan: usersWithPlans.has(u.id),
        subscriptions: userSubscriptionsMap[u.id] || [],
      }));

      const totalCount = total || 0;
      return res.json({
        data: enrichedUsers,
        meta: {
          total: totalCount,
          page: pageNum,
          perPage: limit,
          pageCount: Math.ceil(totalCount / limit),
        },
      });
    } catch (err) {
      console.log(err, "Error in getting users");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  /* ── Show (Get User by ID) ──────────────────────────────────────────── */
  static show = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;

    try {
      const user = await findById(Tables.USERS, id);

      if (user) {
        // Exclude password from response
        const { password, ...userWithoutPassword } = user;
        return res.json({ data: userWithoutPassword });
      }

      return res
        .status(404)
        .json({ error: { message: "User not found." } });
    } catch (err) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  /* ── Update User ────────────────────────────────────────────────────── */
  static update = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const input: UpdateUserDTO = req.body;
    if (input.password) {
      // @ts-ignore
      delete input.password;
    }
    try {
      const checkUser = await findById(Tables.USERS, id);

      if (!checkUser) {
        return res
          .status(404)
          .json({ error: { message: "User to update does not exists." } });
      }

      const updates: Record<string, any> = toSnakeCase({ ...input });
      if ((req.file as any)?.filename) {
        updates.image = `${FileEnum.PROFILEIMAGE}${req?.file?.filename}`;
      } else {
        updates.photo_id = checkUser.photo_id;
      }

      const user = await updateById(Tables.USERS, id, updates);

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

  /* ── Destroy (Soft-delete User) ──────────────────────────────────────── */
  static destroy = async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;

    try {
      const user = await updateById(Tables.USERS, id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
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

  /* ── Photo Skipped ──────────────────────────────────────────────────── */
  static isUserPhotoSkipped = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const user = req.user as UserInterface;
    try {
      if (!req.body.isPhotoSkipped === true) {
        return res.json({ message: "Invalid Request body." });
      }

      const userToUpdate = await updateById(
        Tables.USERS,
        (user as any).id,
        { has_photo_info: true }
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

  /* ── Download Document ──────────────────────────────────────────────── */
  static downloadDocument = async (
    req: Request,
    res: Response
  ): Promise<any> => {
    try {
      const { id } = req.params;
      const file = await findById(Tables.FILES, id);
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

  /* ── Find User by Username ──────────────────────────────────────────── */
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

      const userNameStr = String(userName);

      // Find by username (case-insensitive) or by UUID
      let user: any = null;

      const { data: userByName } = await db
        .from(Tables.USERS)
        .select("*")
        .ilike("user_name", userNameStr)
        .maybeSingle();

      user = userByName;

      // Fallback: try by ID if valid UUID
      if (!user && isValidUUID(userNameStr)) {
        user = await findById(Tables.USERS, userNameStr);
      }

      // As a last resort in dev, fall back to the current session user
      if (!user && (req as any).session?.user?.id) {
        try {
          user = await findById(
            Tables.USERS,
            (req as any).session.user.id
          );
        } catch {}
      }
      if (!user)
        return res.status(404).json({ error: "User not found." });

      // Check if logged-in user is following
      let isFollowing = false;
      const authHeader = req.headers.authorization;
      let loggedInUser: any = null;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
          const decodedToken = jwt.verify(
            token,
            JWT_SECRET
          ) as unknown as { id: string };

          loggedInUser = await findById(Tables.USERS, decodedToken.id);
          if (loggedInUser) {
            const { data: followRecord } = await db
              .from(Tables.USER_CONNECTIONS)
              .select("id")
              .eq("owner", loggedInUser.id)
              .eq("following_to", user.id)
              .maybeSingle();
            isFollowing = !!followRecord;
          }
        } catch (error) {
          console.error("Token verification failed:", error);
        }
      }

      // Fetch photo and cover photo
      let photo: any = null;
      let coverPhoto: any = null;
      if (user.photo_id) {
        photo = await findById(Tables.FILES, user.photo_id);
      }
      if (user.cover_photo_id) {
        coverPhoto = await findById(Tables.FILES, user.cover_photo_id);
      }

      // Fetch subscription plans (non-deleted)
      const { data: subscriptionPlans } = await db
        .from(Tables.SUBSCRIPTION_PLANS)
        .select("*")
        .eq("user_id", user.id)
        .eq("is_deleted", false);

      // Fetch features for plans
      const allFeatureIds = (subscriptionPlans || [])
        .flatMap((p: any) => p.feature_ids || [])
        .filter(Boolean);

      let featuresMap: Record<string, any> = {};
      if (allFeatureIds.length > 0) {
        const { data: features } = await db
          .from(Tables.FEATURES)
          .select("*")
          .in("id", [...new Set(allFeatureIds)]);
        if (features) {
          featuresMap = Object.fromEntries(
            features.map((f: any) => [f.id, f])
          );
        }
      }

      // Enrich plans with feature objects and isJoined status
      let enrichedPlans = (subscriptionPlans || []).map((plan: any) => ({
        ...plan,
        featureIds: (plan.feature_ids || [])
          .map((fid: string) => featuresMap[fid])
          .filter(Boolean),
        isJoined: false,
      }));

      // If logged-in user, update isJoined based on their active subscriptions
      if (loggedInUser) {
        const { data: loggedInSubs } = await db
          .from(Tables.SUBSCRIPTIONS)
          .select("plan_id")
          .eq("user_id", loggedInUser.id)
          .eq("status", SubscriptionStatusEnum.ACTIVE);

        const loggedInSubPlanIds = new Set(
          (loggedInSubs || []).map((s: any) => s.plan_id)
        );

        enrichedPlans = enrichedPlans.map((plan: any) => ({
          ...plan,
          isJoined: loggedInSubPlanIds.has(plan.id),
        }));
      }

      // Count followers
      const followersCount = await count(Tables.USER_CONNECTIONS, {
        following_to: user.id,
      });

      // Count following
      const followingCount = await count(Tables.USER_CONNECTIONS, {
        owner: user.id,
      });

      // Count posts (non-deleted, type POST)
      const { count: postsCountResult } = await db
        .from(Tables.POSTS)
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .eq("type", PostType.POST);

      // Count total likes on user's posts
      const { data: userPostIds } = await db
        .from(Tables.POSTS)
        .select("id")
        .eq("user_id", user.id);

      let totalLikes = 0;
      if (userPostIds && userPostIds.length > 0) {
        const postIds = userPostIds.map((p: any) => p.id);
        const { count: likesResult } = await db
          .from(Tables.INTERACTIONS)
          .select("id", { count: "exact", head: true })
          .in("post_id", postIds)
          .eq("type", InteractionType.LIKE_POST)
          .eq("is_deleted", false);
        totalLikes = likesResult || 0;
      }

      // Count subscribers (active subscriptions to user's plans)
      let subscriberCount = 0;
      if (enrichedPlans.length > 0) {
        const planIds = enrichedPlans.map((p: any) => p.id);
        const { count: subCount } = await db
          .from(Tables.SUBSCRIPTIONS)
          .select("id", { count: "exact", head: true })
          .in("plan_id", planIds)
          .eq("status", SubscriptionStatusEnum.ACTIVE);
        subscriberCount = subCount || 0;
      }

      // Fetch user's posts with media
      const { data: posts } = await db
        .from(Tables.POSTS)
        .select("*")
        .eq("user_id", user.id);

      let enrichedPosts = posts || [];
      if (posts && posts.length > 0) {
        const postIds = posts.map((p: any) => p.id);
        const { data: postMedia } = await db
          .from(Tables.POST_MEDIA)
          .select("*")
          .in("post_id", postIds);

        if (postMedia && postMedia.length > 0) {
          const mediaFileIds = postMedia
            .map((m: any) => m.media_id)
            .filter(Boolean);

          let mediaFilesMap: Record<string, any> = {};
          if (mediaFileIds.length > 0) {
            const { data: mediaFiles } = await db
              .from(Tables.FILES)
              .select("*")
              .in("id", [...new Set(mediaFileIds)]);
            if (mediaFiles) {
              mediaFilesMap = Object.fromEntries(
                mediaFiles.map((f: any) => [f.id, f])
              );
            }
          }

          // Group media by post
          const mediaByPost: Record<string, any[]> = {};
          postMedia.forEach((m: any) => {
            if (!mediaByPost[m.post_id]) mediaByPost[m.post_id] = [];
            mediaByPost[m.post_id].push(m);
          });

          enrichedPosts = posts.map((p: any) => ({
            ...p,
            media: mediaByPost[p.id] || [],
            mediaFiles: (mediaByPost[p.id] || [])
              .map((m: any) => mediaFilesMap[m.media_id])
              .filter(Boolean),
          }));
        }
      }

      return res.status(200).json({
        data: {
          ...user,
          isFollowing,
          subscriptionPlans: enrichedPlans,
          posts: enrichedPosts,
          photoId: user.photo_id,
          photo,
          coverPhoto,
          followersCount,
          followingCount,
          postsCount: postsCountResult || 0,
          totalLikes,
          subscriberCount,
        },
      });
    } catch (error) {
      console.error("Error in finding user by username", error);
      return res.status(500).json({ error: "Something went wrong." });
    }
  };

  /* ── Make User Subscription Active ──────────────────────────────────── */
  static makeUserSubscriptionActive = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const { id } = req.params;

    try {
      const checkUser = await findById(Tables.USERS, id);

      if (!checkUser) {
        return res
          .status(404)
          .json({ error: { message: "User to update does not exists." } });
      }
      const user = await updateById(Tables.USERS, id, {
        is_free_subscription: true,
      });

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

  /* ── Grant Free Subscription ────────────────────────────────────────── */
  static grantFreeSubscription = async (
    userId: String,
    freePlanId: String
  ): Promise<any> => {
    try {
      const now = new Date();
      const endDate = new Date();
      endDate.setMonth(now.getMonth() + 1);

      const savedSubscription = await insertOne(Tables.SUBSCRIPTIONS, {
        user_id: userId,
        plan_id: freePlanId,
        stripe_subscription_id: uuidv4(),
        stripe_price_id: uuidv4(),
        status: "active",
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
      });

      console.log("Saved subscription...", savedSubscription);
      return savedSubscription;
    } catch (error) {
      console.log("erro...", error);
    }
  };

  /* ── Update User Status ─────────────────────────────────────────────── */
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
      const user = await findById(Tables.USERS, id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      // Update the `is_active` field based on the `status`
      const isActive = status === "active";
      await updateById(Tables.USERS, id, { is_active: isActive });

      return res.status(200).json({
        success: true,
        message: `User status updated to ${status}.`,
        data: {
          userId: user.id,
          isActive,
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
