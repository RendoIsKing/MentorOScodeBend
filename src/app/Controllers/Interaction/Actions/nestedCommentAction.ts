import { Request, Response } from "express";
import { Interaction } from "../../../Models/Interaction"; // Update the import path as necessary
import { UserInterface } from "../../../../types/UserInterface"; // Update the import path as necessary
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { User } from "../../../Models/User";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { Post } from "../../../Models/Post";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";

export const addNestedComment = async (req: Request, res: Response) => {
  try {
    const { comment: childComment } = req.body;
    const parentCommentId = req.params.id;
    const user = req.user as UserInterface;

    const parentComment = await Interaction.findById(parentCommentId);

    if (!parentComment) {
      return res
        .status(404)
        .json({ error: { message: "Parent comment not found" } });
    }
    if (parentComment.type !== InteractionType.COMMENT) {
      return res.status(404).json({
        error: {
          message: "You can only reply to a comment type interaction",
        },
      });
    }

    const newChildComment = new Interaction({
      type: InteractionType.COMMENT,
      post: parentComment.post,
      // user: parentComment.user,
      interactedBy: user._id,
      comment: childComment,
      isChildComment: true,
      isDeleted: false,
      parentComment: parentCommentId,
    });

    await newChildComment.save();

    if (!parentComment.replies) {
      parentComment.replies = [];
    }

    parentComment.replies.push(newChildComment._id);

    await parentComment.save();

    const updatedParentComment = await Interaction.findById(parentCommentId)
      .populate({
        path: "replies",
        populate: {
          path: "interactedBy",
          select: "username",
        },
      })
      .exec();

    try {
      //notification to the user to whom the post belongs
      const post = await Post.findOne({ id: parentComment.post });
      const postUser = await User.findById(post?.user);
      if (postUser && postUser.fcm_token) {
        const notificationToken = postUser.fcm_token;
        if (notificationToken) {
          await sendNotification(
            notificationToken,
            "New Comment on your post",
            `${user.userName} commented on your post`,
            FirebaseNotificationEnum.COMMENT,
            postUser.userName
          );
        } else {
          console.error("FCM token for the user not found");
        }
      }
      // Notification to the user who made the parent comment
      const parentCommentUser = await User.findById(parentComment.interactedBy);
      if (parentCommentUser && parentCommentUser.fcm_token) {
        const notificationToken = parentCommentUser.fcm_token;
        if (notificationToken) {
          await sendNotification(
            notificationToken,
            "New Reply to your comment",
            `${user.userName} replied to your comment`,
            FirebaseNotificationEnum.COMMENT,
            parentCommentUser.userName
          );
        } else {
          console.error("FCM token for the parent comment user not found");
        }
      }
    } catch (error) {
      console.log("Error sending like notification", error);
    }

    return res.json({
      data: updatedParentComment,
      message: "Child Comment added successfully",
    });
  } catch (error) {
    console.error("Error adding nested comment:", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
