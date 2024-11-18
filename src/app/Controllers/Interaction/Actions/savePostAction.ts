import { Response, Request } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { Post } from "../../../Models/Post";
import { IPostSchema } from "../../../../types/interfaces/postsInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { Interaction } from "../../../Models/Interaction";

export const savePostAction = async (
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

    const saveIntereactionExist = await Interaction.findOne({
      user: postExists.user,
      interactedBy: user.id,
      type: InteractionType.COLLECTION_SAVED,
      post: postId,
      collectionId: { $in: [user.primaryCollection] },
    });

    if (saveIntereactionExist) {
      await Interaction.deleteOne({ _id: saveIntereactionExist.id });
      return res.json({
        data: {
          message: "Saved post removed",
        },
      });
    }

    const savedInteraction = await Interaction.create({
      user: postExists.user,
      interactedBy: user.id,
      type: InteractionType.COLLECTION_SAVED,
      post: postId,
      collectionId: [user.primaryCollection],
    });

    return res.json({
      data: savedInteraction,
      message: "Interaction saved .",
    });
  } catch (err) {
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
