import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { findById, findOne, insertOne, Tables } from "../../../../lib/db";

export const createImpression = async (req: Request, res: Response) => {
  try {
    const { postId } = req.body;
    const user = req.user as UserInterface;

    if (!postId) {
      return res
        .status(404)
        .json({ error: { message: "Post Id is required" } });
    }
    const post = await findById(Tables.POSTS, postId);

    if (!post) {
      return res.status(404).json({ error: { message: "Post not found" } });
    }

    const interactionExists = await findOne(Tables.INTERACTIONS, {
      type: InteractionType.IMPRESSION,
      post_id: postId,
      user_id: post.user_id,
      interacted_by: user._id || user.id,
    });

    if (interactionExists) {
      return res.json({
        data: {
          message: "Interaction exists",
        },
      });
    }

    const impression = await insertOne(Tables.INTERACTIONS, {
      type: InteractionType.IMPRESSION,
      post_id: postId,
      user_id: post.user_id,
      interacted_by: user._id || user.id,
      is_deleted: false,
    });

    return res.json({
      data: impression,
      message: "impression created successfully",
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
