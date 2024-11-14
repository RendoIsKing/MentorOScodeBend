import { Request, Response } from "express";
import { Interaction } from "../../../Models/Interaction";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { User } from "../../../Models/User";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { saveNotification } from "../../Notifications/Actions/saveNotification";

export const likeAComment = async (req: Request, res: Response) => {
  try {
    const commentId = req.params.id;
    const user = req.user as UserInterface;
    const comment = await Interaction.findById(commentId);

    if (!comment) {
      return res
        .status(404)
        .json({ error: { message: "Parent comment not found" } });
    }
    if (comment.type !== InteractionType.COMMENT) {
      return res.status(404).json({
        error: { message: "You can only like to a comment type interaction" },
      });
    }
    const commentLikeExist = await Interaction.findOne({
      type: InteractionType.LIKE_COMMENT,
      post: comment.post,
      user: comment.user,
      interactedBy: user._id,
      isDeleted: false,
      comment: comment.comment,
    });

    if (commentLikeExist) {
      console.log("HERERERERERE");
      await Interaction.deleteOne({ _id: commentLikeExist.id });
      return res.json({
        data: {
          message: "Comment disliked",
        },
      });
    }

    const likeToComment = new Interaction({
      type: InteractionType.LIKE_COMMENT,
      post: comment.post,
      user: comment.user,
      interactedBy: user._id,
      isDeleted: false,
      comment: comment.comment,
    });

    await likeToComment.save();

    if (!comment.likes) {
      comment.likes = [];
    }

    comment.likes.push(user._id);

    try {
      const userComment = await User.findById(comment.user);
      const interactedByUser = await User.findById(user.id);
      if (!interactedByUser) {
        return res
          .status(404)
          .json({ error: { message: "Username not found" } });
      }
      if (userComment && userComment.fcm_token) {
        const notificationToken = userComment.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New like on your comment";
          const notificationDescription = `${interactedByUser.userName} liked your comment`;
          await sendNotification(
            notificationToken,
            "New Like on your comment",
            `${interactedByUser?.userName} liked your comment`,
            FirebaseNotificationEnum.LIKE_COMMENT,
            comment.post
          );

          await saveNotification({
            title: notificationTitle,
            description: notificationDescription,
            sentTo: [userComment._id],
            type: FirebaseNotificationEnum.LIKE_COMMENT,
            notificationOnPost: comment.post,
            notificationFromUser: null,
          });
        } else {
          console.error("FCM token for the user not found");
        }
      }
    } catch (error) {
      console.log("Error sending like notification", error);
    }

    await comment.save();

    const updatedComment = await Interaction.findById(commentId)
      .populate({
        path: "likes",
        populate: {
          path: "interactedBy",
          select: "username",
        },
      })
      .exec();

    return res.json({
      data: updatedComment,
      message: "Comment liked successfully",
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
