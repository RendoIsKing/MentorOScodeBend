import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { Post } from "../../../Models/Post";
import { IPostSchema } from "../../../../types/interfaces/postsInterface";
import { Interaction } from "../../../Models/Interaction";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { validate } from "class-validator";
import { CommentInput } from "../Inputs/postCommentInput";
import { plainToClass } from "class-transformer";
import { User } from "../../../Models/User";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { saveNotification } from "../../Notifications/Actions/saveNotification";

export const commentAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const postId = req.params.id;

    const postInput = plainToClass(CommentInput, req.body);
    const postExists = (await Post.findById(postId)) as IPostSchema;

    if (!postExists || postExists?.isDeleted) {
      return res.status(400).json({ error: { message: "Post not exist" } });
    }

    const validationErrors = await validate(postInput);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    const commentInteraction = await Interaction.create({
      comment: req.body.comment,
      user: postExists.user,
      interactedBy: user.id,
      type: InteractionType.COMMENT,
      post: postId,
    });

    try {
      const userComment = await User.findById(postExists.user);
      const interactedByUser = await User.findById(user.id);
      if (!interactedByUser) {
        return res
          .status(404)
          .json({ error: { message: "Username not found" } });
      }
      if (userComment && userComment.fcm_token) {
        const notificationToken = userComment.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New Comment on your post";
          const notificationDescription = `${interactedByUser.userName} commented on your post`;
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
            sentTo: [userComment._id],
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
