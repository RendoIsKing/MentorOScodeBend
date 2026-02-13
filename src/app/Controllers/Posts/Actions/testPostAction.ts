import { Request, Response } from "express";
import { findOne, Tables } from "../../../../lib/db";

export const getFirstPost = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const post = await findOne(Tables.POSTS, { is_deleted: false });

    if (!post) {
      return res.status(404).json({ error: "No posts found" });
    }

    return res.json(post);
  } catch (error) {
    console.error("Error retrieving Post:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
