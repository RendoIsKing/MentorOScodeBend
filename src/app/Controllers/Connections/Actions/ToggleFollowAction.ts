import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { plainToClass } from "class-transformer";
import { FollowInput } from "../Inputs/createFollowInput";
import { validate } from "class-validator";
import { findOne, findById, insertOne, deleteById, Tables } from "../../../../lib/db";
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

    const followExists = await findOne(Tables.USER_CONNECTIONS, {
      owner: user.id,
      following_to: createFollowInput.followingTo,
    });

    if (followExists) {
      await deleteById(Tables.USER_CONNECTIONS, followExists.id);
      return res.json({
        message: "Account Unfollowed",
      });
    }

    const newFollow = await insertOne(Tables.USER_CONNECTIONS, {
      owner: user.id,
      following_to: createFollowInput.followingTo,
    });

    try {
      const followedUser = await findById(Tables.USERS, createFollowInput.followingTo);
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
            sentTo: [followedUser.id],
            type: FirebaseNotificationEnum.FOLLOW,
            notificationOnPost: null,
            notificationFromUser: user.id,
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
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
