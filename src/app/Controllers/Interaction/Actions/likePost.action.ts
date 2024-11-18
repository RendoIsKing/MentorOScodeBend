import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { Post } from "../../../Models/Post";
import { IPostSchema } from "../../../../types/interfaces/postsInterface";
import { Interaction } from "../../../Models/Interaction";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { User } from "../../../Models/User";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { saveNotification } from "../../Notifications/Actions/saveNotification";

export const toggleLikeAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const postId = req.params.id;
    const postExists = (await Post.findById(postId)) as IPostSchema;

    if (!postExists || postExists?.isDeleted) {
      return res.status(400).json({ error: { message: "Post not exist" } });
    }

    const intreactionExist = await Interaction.findOne({
      user: postExists.user,
      interactedBy: user.id,
      type: InteractionType.LIKE_POST,
      post: postId,
    });

    if (intreactionExist) {
      await Interaction.deleteOne({ _id: intreactionExist.id });
      return res.json({
        data: {
          message: "Post disliked",
        },
      });
    }

    const like = await Interaction.create({
      user: postExists.user,
      interactedBy: user.id,
      type: InteractionType.LIKE_POST,
      post: postId,
    });

    try {
      const userPostLiked = await User.findById(postExists.user);
      const interactedByUser = await User.findById(user.id);
      if (!interactedByUser) {
        return res
          .status(404)
          .json({ error: { message: "Username not found" } });
      }
      if (userPostLiked && userPostLiked.fcm_token) {
        const notificationToken = userPostLiked.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New Like on your post";
          const notificationDescription = `${interactedByUser.userName} liked your post`;
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
            sentTo: [userPostLiked._id],
            type: FirebaseNotificationEnum.LIKE_POST,
            notificationOnPost: postExists.id,
            notificationFromUser: null

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
  } catch (error) {
    console.log(error, "Error in liking the post");
    if (error.code === 11000) {
      return res
        .status(500)
        .json({ error: { message: "User already liked the post", error } });
    }
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
