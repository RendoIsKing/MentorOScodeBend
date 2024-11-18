import { Request, Response } from "express";
import { Interaction } from "../../../Models/Interaction"; // Update the import path as necessary
import { UserInterface } from "../../../../types/UserInterface"; // Update the import path as necessary
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { Post } from "../../../Models/Post";

export const createImpression = async (req: Request, res: Response) => {
  try {
    const { postId } = req.body;
    const user = req.user as UserInterface;

    if (!postId) {
      return res
        .status(404)
        .json({ error: { message: "Post Id is required" } });
    }
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: { message: "Post not found" } });
    }

    const interactionExists = await Interaction.findOne({
      type: InteractionType.IMPRESSION,
      post: postId,
      user: post.user,
      interactedBy: user._id,
    });

    if (interactionExists) {
      return res.json({
        data: {
          message: "Interaction exists",
        },
      });
    }

    const impression = new Interaction({
      type: InteractionType.IMPRESSION,
      post: postId,
      user: post.user,
      interactedBy: user._id,
      isDeleted: false,
    });

    await impression.save();

    return res.json({
      data: impression,
      message: "impression created successfully",
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
