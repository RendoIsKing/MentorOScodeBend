import { Request, Response } from "express";
import { Post } from "../../../Models/Post";

export const getFirstPost = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const post = await Post.findOne({
      deletedAt: null,
      isDeleted: false,
    }).exec();

    if (!post) {
      return res.status(404).json({ error: "No posts found" });
    }

    return res.json(post);
  } catch (error) {
    console.error("Error retrieving Post:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
