import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { findById, insertOne, Tables } from "../../../../lib/db";

export const logView = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const user = req.user as UserInterface;
  const { postId } = req.body;
  if (!postId) {
    return res.status(400).json({ error: { message: "Post Id is required" } });
  }
  try {
    const post = await findById(Tables.POSTS, postId);

    if (!post) {
      return res.status(404).json({ error: { message: "Post not found" } });
    }

    const view = await insertOne(Tables.INTERACTIONS, {
      user_id: post.user_id,
      post_id: postId,
      type: InteractionType.VIEW,
      interacted_by: user.id,
    });

    return res.json({
      data: view,
      message: "View logged",
    });
  } catch (error) {
    console.log("error in logging view", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
