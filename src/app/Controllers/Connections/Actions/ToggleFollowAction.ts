import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { plainToClass } from "class-transformer";
import { FollowInput } from "../Inputs/createFollowInput";
import { userConnection } from "../../../Models/Connection";
import { validate } from "class-validator";
import { User } from "../../../Models/User";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { saveNotification } from "../../Notifications/Actions/saveNotification";

export const toggleFollow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;

    const createFollowInput = plainToClass(FollowInput, req.body);
    const validationErrors = await validate(createFollowInput);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    const followExists = await userConnection.findOne({
      owner: user.id,
      followingTo: createFollowInput.followingTo,
    });

    if (followExists) {
      await userConnection.deleteOne({ _id: followExists.id });
      return res.json({
        message: "Account Unfollowed",
      });
    }

    const newFollow = await userConnection.create({
      owner: user.id,
      followingTo: createFollowInput.followingTo,
    });
    try {
      const followedUser = await User.findById(createFollowInput.followingTo);
      if (followedUser && followedUser.fcm_token) {
        const notificationToken = followedUser.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New Follower";
          const notificationDescription = `${user.userName} is now following you`;

          await sendNotification(
            notificationToken,
            notificationTitle,
            notificationDescription,
            FirebaseNotificationEnum.FOLLOW,
            user.userName
          );

          await saveNotification({
            title: notificationTitle,
            description: notificationDescription,
            sentTo: [followedUser._id],
            type: FirebaseNotificationEnum.FOLLOW,
            notificationOnPost: null,
            notificationFromUser: user.id

          });
        } else {
          console.error("FCM token for the user not found");
        }
      }
    } catch (error) {
      console.log("Error sending follow notification", error);
    }

    return res.json({
      data: newFollow,
      message: "You are now following this account",
    });
  } catch (error) {
    console.error("Error following account:", error);
    if (error.code === 11000) {
      return res.status(500).json({
        error: { message: "You are already following this account", error },
      });
    }
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
