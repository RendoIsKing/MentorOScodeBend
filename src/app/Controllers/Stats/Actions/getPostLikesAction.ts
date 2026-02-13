import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";

export const getPostLikes = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const { data: likes, error } = await db
      .from(Tables.INTERACTIONS)
      .select("*, user:users!user_id(*)")
      .eq("post_id", id)
      .eq("type", "LIKE_POST")
      .eq("is_deleted", false);

    if (error) {
      console.error("Error fetching likes on post", error);
      return res.status(500).json({ error: "Something went wrong." });
    }

    return res.status(200).json({ data: likes || [] });
  } catch (error) {
    console.error("Error fetching likes on post", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
