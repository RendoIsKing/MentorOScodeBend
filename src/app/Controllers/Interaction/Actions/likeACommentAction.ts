import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { saveNotification } from "../../Notifications/Actions/saveNotification";
import {
  db,
  findById,
  findOne,
  insertOne,
  deleteById,
  Tables,
} from "../../../../lib/db";

export const likeAComment = async (req: Request, res: Response) => {
  try {
    const commentId = req.params.id;
    const user = req.user as UserInterface;
    const userId = user._id || user.id;
    const comment = await findById(Tables.INTERACTIONS, commentId);

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

    // Check if this user already liked this comment (via interaction_likes table)
    const existingLike = await findOne(Tables.INTERACTION_LIKES, {
      interaction_id: commentId,
      user_id: userId,
    });

    if (existingLike) {
      // Unlike: remove from interaction_likes and delete the LIKE_COMMENT interaction
      await deleteById(Tables.INTERACTION_LIKES, existingLike.id);

      // Also remove the LIKE_COMMENT interaction if it exists
      const likeInteraction = await findOne(Tables.INTERACTIONS, {
        type: InteractionType.LIKE_COMMENT,
        post_id: comment.post_id,
        interacted_by: userId,
        comment: comment.comment,
      });
      if (likeInteraction) {
        await deleteById(Tables.INTERACTIONS, likeInteraction.id);
      }

      return res.json({
        data: {
          message: "Comment disliked",
        },
      });
    }

    // Create the LIKE_COMMENT interaction
    await insertOne(Tables.INTERACTIONS, {
      type: InteractionType.LIKE_COMMENT,
      post_id: comment.post_id,
      user_id: comment.user_id,
      interacted_by: userId,
      is_deleted: false,
      comment: comment.comment,
    });

    // Insert into interaction_likes (replaces comment.likes.push())
    await insertOne(Tables.INTERACTION_LIKES, {
      interaction_id: commentId,
      user_id: userId,
    });

    // Send notification
    try {
      const userComment = await findById(Tables.USERS, comment.user_id);
      const interactedByUser = await findById(Tables.USERS, user.id || '');
      if (!interactedByUser) {
        return res
          .status(404)
          .json({ error: { message: "Username not found" } });
      }
      if (userComment && userComment.fcm_token) {
        const notificationToken = userComment.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New like on your comment";
          const notificationDescription = `${interactedByUser.user_name} liked your comment`;
          await sendNotification(
            notificationToken,
            "New Like on your comment",
            `${interactedByUser.user_name} liked your comment`,
            FirebaseNotificationEnum.LIKE_COMMENT,
            comment.post_id
          );

          await saveNotification({
            title: notificationTitle,
            description: notificationDescription,
            sentTo: [userComment.id],
            type: FirebaseNotificationEnum.LIKE_COMMENT,
            notificationOnPost: comment.post_id,
            notificationFromUser: null,
          });
        } else {
          console.error("FCM token for the user not found");
        }
      }
    } catch (error) {
      console.log("Error sending like notification", error);
    }

    // Fetch updated likes for the comment from interaction_likes
    const { data: likes } = await db
      .from(Tables.INTERACTION_LIKES)
      .select("*, user:users!user_id(id, user_name)")
      .eq("interaction_id", commentId);

    const updatedComment = {
      ...comment,
      likes: (likes || []).map((l: any) => l.user),
    };

    return res.json({
      data: updatedComment,
      message: "Comment liked successfully",
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
