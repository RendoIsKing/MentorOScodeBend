import { Router } from "express";
import passport from 'passport';

import { UsersControllers } from "../app/Controllers/";
import { Auth, OnlyAdmins } from "../app/Middlewares";

import { FileEnum } from "../types/FileEnum";
import { createMulterInstance } from "../app/Middlewares/fileUpload";
import { updateProfilePicture } from '../app/Controllers/updateProfilePicture';

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
user.post("/fcm-token", Auth, UsersControllers.updateFcmToken);

user.post("/hasPhotoSkipped", Auth, UsersControllers.isUserPhotoSkipped);
user.get("/file-download/:id", Auth, UsersControllers.downloadDocument);

user.get("/files/:id", UsersControllers.getFile);
user.get("/find", UsersControllers.findUserByUserName);

user.post("/file-upload", upload.single("file"), UsersControllers.fileUpload);

user.post("/", OnlyAdmins, upload.single("image"), UsersControllers.create);
user.get;
user.post("/account", Auth, UsersControllers.onboardUser);
user.get(
  "/user-name-availability",
  Auth,
  UsersControllers.checkUsernameAvailability
);

user.get("/", Auth, UsersControllers.index);
user.get("/:id", UsersControllers.show);
user.post("/:id", OnlyAdmins, upload.single("image"), UsersControllers.update);
user.delete("/:id", OnlyAdmins, UsersControllers.destroy);
user.delete("/file-remove/:id", Auth, UsersControllers.deleteFile);
user.patch(
  "/:id/make-it-free",
  OnlyAdmins,
  UsersControllers.makeUserSubscriptionActive
);
user.put("/:id/status", OnlyAdmins, UsersControllers.updateUserStatus);

user.post(
  '/profile-picture',
  passport.authenticate('jwt', { session: false }),
  updateProfilePicture
);

export default user;
