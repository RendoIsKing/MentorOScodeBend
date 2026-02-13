import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { PostType } from "../../../../types/enums/postTypeEnum";
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

export const toggleLikeStoryAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const storyId = req.params.id;

    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    // Find the story
    const { data: storyExists } = await db
      .from(Tables.POSTS)
      .select("*")
      .eq("id", storyId)
      .eq("type", PostType.STORY)
      .eq("is_deleted", false)
      .gte("created_at", twentyFourHoursAgo)
      .maybeSingle();

    if (!storyExists || storyExists.is_deleted) {
      return res.status(400).json({ error: { message: "Story not exist" } });
    }

    const interactionExist = await findOne(Tables.INTERACTIONS, {
      user_id: storyExists.user_id,
      interacted_by: user.id,
      type: InteractionType.LIKE_STORY,
      post_id: storyId,
    });

    if (interactionExist) {
      await deleteById(Tables.INTERACTIONS, interactionExist.id);
      return res.json({
        data: {
          message: "Story disliked",
        },
      });
    }

    const like = await insertOne(Tables.INTERACTIONS, {
      user_id: storyExists.user_id,
      interacted_by: user.id,
      type: InteractionType.LIKE_STORY,
      post_id: storyId,
    });

    try {
      const userStory = await findById(Tables.USERS, storyExists.user_id);
      const interactedByUser = await findById(Tables.USERS, user.id || '');
      if (!interactedByUser) {
        return res
          .status(404)
          .json({ error: { message: "Username not found" } });
      }
      if (userStory && userStory.fcm_token) {
        const notificationToken = userStory.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New Like on your story";
          const notificationDescription = `${interactedByUser.user_name} liked your story`;
          await sendNotification(
            notificationToken,
            notificationTitle,
            notificationDescription,
            FirebaseNotificationEnum.LIKE_STORY,
            userStory.user_name
          );

          await saveNotification({
            title: notificationTitle,
            description: notificationDescription,
            sentTo: [userStory.id],
            type: FirebaseNotificationEnum.LIKE_STORY,
            notificationOnPost: null,
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
      message: "Story liked",
    });
  } catch (error: any) {
    console.log(error, "error in liking story");
    if (error.code === "23505") {
      return res
        .status(500)
        .json({ error: { message: "User already liked the story", error } });
    }
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
