import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { Post } from "../../../Models/Post";
import { IPostSchema } from "../../../../types/interfaces/postsInterface";
import { Interaction } from "../../../Models/Interaction";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { twentyFourHoursAgo } from "../../Posts/Actions/getAllStoriesAction";
import { IInteractionSchema } from "../../../../types/interfaces/InteractionInterface";
import { User } from "../../../Models/User";
import { sendNotification } from "../../../../utils/Notifications/notificationService";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";
import { saveNotification } from "../../Notifications/Actions/saveNotification";

export const toggleLikeStoryAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const storyId = req.params.id;
    const storyExists = (await Post.findOne({
      _id: storyId,
      type: PostType.STORY,
      isDeleted: false,
      createdAt: { $gte: twentyFourHoursAgo },
    })) as IPostSchema;

    if (!storyExists || storyExists?.isDeleted) {
      return res.status(400).json({ error: { message: "Story not exist" } });
    }

    const intreactionExist = (await Interaction.findOne({
      user: storyExists.user,
      interactedBy: user.id,
      type: InteractionType.LIKE_STORY,
      post: storyExists,
    })) as IInteractionSchema;

    if (intreactionExist) {
      await Interaction.deleteOne({ _id: intreactionExist.id });
      return res.json({
        data: {
          message: "Story disliked",
        },
      });
    }

    const like = await Interaction.create({
      user: storyExists.user,
      interactedBy: user.id,
      type: InteractionType.LIKE_STORY,
      post: storyId,
    });

    try {
      const userStory = await User.findById(storyExists.user);
      const interactedByUser = await User.findById(user.id);
      if (!interactedByUser) {
        return res
          .status(404)
          .json({ error: { message: "Username not found" } });
      }
      if (userStory && userStory.fcm_token) {
        const notificationToken = userStory.fcm_token;
        if (notificationToken) {
          const notificationTitle = "New Like on your story";
          const notificationDescription = `${interactedByUser.userName} liked your story`;
          await sendNotification(
            notificationToken,
            notificationTitle,
            notificationDescription,
            FirebaseNotificationEnum.LIKE_STORY,
            userStory.userName
          );

          await saveNotification({
            title: notificationTitle,
            description: notificationDescription,
            sentTo: [userStory._id],
            type: FirebaseNotificationEnum.LIKE_STORY,
            notificationOnPost: null,
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
      message: "Story liked",
    });
  } catch (error) {
    console.log(error, "error in liking story");
    if (error.code === 11000) {
      return res
        .status(500)
        .json({ error: { message: "User already liked the story", error } });
    }
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
