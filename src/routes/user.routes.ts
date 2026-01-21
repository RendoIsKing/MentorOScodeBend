import { Router } from "express";
import passport from 'passport';

import { UsersControllers } from "../app/Controllers/";
import { Auth, OnlyAdmins, validateZod } from "../app/Middlewares";

import { FileEnum } from "../types/FileEnum";
import { createMulterInstance } from "../app/Middlewares/fileUpload";
import { updateProfilePicture } from '../app/Controllers/updateProfilePicture';
import { z } from "zod";
import { nonEmptyString, objectIdParam } from "../app/Validation/requestSchemas";

const user: Router = Router();
const uploadBase =
  (process.env.UPLOAD_ROOT
    ? (require('path') as typeof import('path')).isAbsolute(process.env.UPLOAD_ROOT)
      ? process.env.UPLOAD_ROOT
      : `${process.cwd()}${process.env.UPLOAD_ROOT}`
    : `${process.cwd()}${FileEnum.PUBLICDIR}`);
const upload = createMulterInstance(
  `${uploadBase}${FileEnum.PROFILEIMAGE}`
);
const fcmTokenSchema = z.object({ fcm_token: nonEmptyString }).strict();
const photoSkippedSchema = z.object({ isPhotoSkipped: z.boolean() }).strict();
const locationSchema = z.object({ lat: z.number(), long: z.number() }).strict();
const userInputSchema = z.object({
  fullName: z.string().optional(),
  userName: z.string().optional(),
  instagramLink: z.string().optional(),
  facebookLink: z.string().optional(),
  tiktokLink: z.string().optional(),
  password: z.string().optional(),
  youtubeLink: z.string().optional(),
  bio: z.string().optional(),
  gender: z.string().optional(),
  dob: z.string().optional(),
  email: z.string().email().optional(),
  photoId: z.string().optional(),
  coverPhotoId: z.string().optional(),
  location: z.array(locationSchema).optional(),
}).strict();
const updateUserStatusSchema = z.object({ status: nonEmptyString }).strict();

user.post("/fcm-token", Auth, validateZod({ body: fcmTokenSchema }), UsersControllers.updateFcmToken);

user.post("/hasPhotoSkipped", Auth, validateZod({ body: photoSkippedSchema }), UsersControllers.isUserPhotoSkipped);
user.get("/file-download/:id", Auth, UsersControllers.downloadDocument);

user.get("/files/:id", UsersControllers.getFile);
user.get("/find", UsersControllers.findUserByUserName);

user.post(
  "/file-upload",
  validateZod({ body: z.object({}).passthrough() }),
  upload.single("file"),
  UsersControllers.fileUpload
);

user.post("/", OnlyAdmins, validateZod({ body: userInputSchema }), upload.single("image"), UsersControllers.create);
user.get;
user.post("/account", Auth, validateZod({ body: userInputSchema }), UsersControllers.onboardUser);
user.get(
  "/user-name-availability",
  Auth,
  UsersControllers.checkUsernameAvailability
);

user.get("/", Auth, UsersControllers.index);
user.get("/:id", UsersControllers.show);
user.post("/:id", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: userInputSchema }), upload.single("image"), UsersControllers.update);
user.delete("/:id", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), UsersControllers.destroy);
user.delete("/file-remove/:id", Auth, validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), UsersControllers.deleteFile);
user.patch(
  "/:id/make-it-free",
  OnlyAdmins,
  validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }),
  UsersControllers.makeUserSubscriptionActive
);
user.put("/:id/status", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: updateUserStatusSchema }), UsersControllers.updateUserStatus);

user.post(
  '/profile-picture',
  passport.authenticate('jwt', { session: false }),
  validateZod({ body: z.object({}).passthrough() }),
  updateProfilePicture
);

export default user;
