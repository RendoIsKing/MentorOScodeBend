import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import {
  db,
  findById,
  findOne,
  findMany,
  insertOne,
  Tables,
} from "../../../../lib/db";

export const addNestedComment = async (req: Request, res: Response) => {
  try {
    const { comment: childComment } = req.body;
    const parentCommentId = req.params.id;
    const user = req.user as UserInterface;

    const parentComment = await findById(Tables.INTERACTIONS, parentCommentId);

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

    // Create child comment with parent_id (replaces pushing to replies[])
    await insertOne(Tables.INTERACTIONS, {
      type: InteractionType.COMMENT,
      post_id: parentComment.post_id,
      interacted_by: user._id || user.id,
      comment: childComment,
      is_child_comment: true,
      is_deleted: false,
      parent_id: parentCommentId,
    });

    // Fetch all replies for the parent comment
    const replies = await findMany(
      Tables.INTERACTIONS,
      { parent_id: parentCommentId, is_deleted: false },
      { orderBy: "created_at", ascending: true }
    );

    // Fetch user info for replies
    const replyUserIds = [
      ...new Set(replies.map((r: any) => r.interacted_by)),
    ];
    const { data: replyUsers } = replyUserIds.length
      ? await db
          .from(Tables.USERS)
          .select("id, user_name")
          .in("id", replyUserIds)
      : { data: [] as any[] };

    const userMap: Record<string, any> = {};
    for (const u of replyUsers || []) {
      userMap[u.id] = u;
    }

    const enrichedReplies = replies.map((r: any) => ({
      ...r,
      interactedBy: userMap[r.interacted_by] || null,
    }));

    const updatedParent = {
      ...parentComment,
      replies: enrichedReplies,
    };

    // Send notifications
    try {
      const post = await findOne(Tables.POSTS, { id: parentComment.post_id });
      const postUser = post
        ? await findById(Tables.USERS, post.user_id)
        : null;
      if (postUser && postUser.fcm_token) {
        await sendNotification(
          postUser.fcm_token,
          "New Comment on your post",
          `${user.userName} commented on your post`,
          FirebaseNotificationEnum.COMMENT,
          postUser.user_name
        );
      }
      const parentCommentUser = await findById(
        Tables.USERS,
        parentComment.interacted_by
      );
      if (parentCommentUser && parentCommentUser.fcm_token) {
        await sendNotification(
          parentCommentUser.fcm_token,
          "New Reply to your comment",
          `${user.userName} replied to your comment`,
          FirebaseNotificationEnum.COMMENT,
          parentCommentUser.user_name
        );
      }
    } catch (error) {
      console.log("Error sending notification", error);
    }

    return res.json({
      data: updatedParent,
      message: "Child Comment added successfully",
    });
  } catch (error) {
    console.error("Error adding nested comment:", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
