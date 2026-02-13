import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { saveNotification } from "../../Notifications/Actions/saveNotification";
import {
  findById,
  findOne,
  insertOne,
  deleteById,
  Tables,
} from "../../../../lib/db";

export const toggleLikeAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const postId = req.params.id;
    const postExists = await findById(Tables.POSTS, postId);

    if (!postExists || postExists.is_deleted) {
      return res.status(400).json({ error: { message: "Post not exist" } });
    }

    const interactionExist = await findOne(Tables.INTERACTIONS, {
      user_id: postExists.user_id,
      interacted_by: user.id,
      type: InteractionType.LIKE_POST,
      post_id: postId,
    });

    if (interactionExist) {
      await deleteById(Tables.INTERACTIONS, interactionExist.id);
      return res.json({
        data: {
          message: "Post disliked",
        },
      });
    }

    const like = await insertOne(Tables.INTERACTIONS, {
      user_id: postExists.user_id,
      interacted_by: user.id,
      type: InteractionType.LIKE_POST,
      post_id: postId,
    });

    try {
      const userPostLiked = await findById(Tables.USERS, postExists.user_id);
      const interactedByUser = await findById(Tables.USERS, user.id);
      if (!interactedByUser) {
        return res
          .status(404)
          .json({ error: { message: "Username not found" } });
      }
      if (userPostLiked && userPostLiked.fcm_token) {
        const notificationToken = userPostLiked.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New Like on your post";
          const notificationDescription = `${interactedByUser.user_name} liked your post`;
          await sendNotification(
            notificationToken,
            notificationTitle,
            notificationDescription,
            FirebaseNotificationEnum.LIKE_POST,
            postExists.id
          );
          await saveNotification({
            title: notificationTitle,
            description: notificationDescription,
            sentTo: [userPostLiked.id],
            type: FirebaseNotificationEnum.LIKE_POST,
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
      data: like,
      message: "Post liked",
    });
  } catch (error: any) {
    console.log(error, "Error in liking the post");
    if (error.code === "23505") {
      return res
        .status(500)
        .json({ error: { message: "User already liked the post", error } });
    }
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
