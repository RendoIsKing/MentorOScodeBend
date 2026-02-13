import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { validate } from "class-validator";
import { CommentInput } from "../Inputs/postCommentInput";
import { plainToClass } from "class-transformer";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { saveNotification } from "../../Notifications/Actions/saveNotification";
import { findById, insertOne, Tables } from "../../../../lib/db";

export const commentAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const postId = req.params.id;

    const postInput = plainToClass(CommentInput, req.body);
    const postExists = await findById(Tables.POSTS, postId);

    if (!postExists || postExists.is_deleted) {
      return res.status(400).json({ error: { message: "Post not exist" } });
    }

    const validationErrors = await validate(postInput);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    const commentInteraction = await insertOne(Tables.INTERACTIONS, {
      comment: req.body.comment,
      user_id: postExists.user_id,
      interacted_by: user.id,
      type: InteractionType.COMMENT,
      post_id: postId,
    });

    try {
      const userComment = await findById(Tables.USERS, postExists.user_id);
      const interactedByUser = await findById(Tables.USERS, user.id);
      if (!interactedByUser) {
        return res
          .status(404)
          .json({ error: { message: "Username not found" } });
      }
      if (userComment && userComment.fcm_token) {
        const notificationToken = userComment.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New Comment on your post";
          const notificationDescription = `${interactedByUser.user_name} commented on your post`;
          await sendNotification(
            notificationToken,
            notificationTitle,
            notificationDescription,
            FirebaseNotificationEnum.COMMENT,
            postExists.id
          );

          await saveNotification({
            title: notificationTitle,
            description: notificationDescription,
            sentTo: [userComment.id],
            type: FirebaseNotificationEnum.COMMENT,
            notificationOnPost: postExists.id,
            notificationFromUser: null,
          });
        } else {
          console.error("FCM token for the user not found");
        }
      }
    } catch (error) {
      console.log("Error sending like notification", error);
    }

    return res.json({
      data: commentInteraction,
      message: "Comment posted successfully.",
    });
  } catch (error) {
    console.log("error in posting comment", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
