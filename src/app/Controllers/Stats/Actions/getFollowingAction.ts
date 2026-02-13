import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";

export const getFollowing = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const { data: following, error } = await db
      .from(Tables.USER_CONNECTIONS)
      .select(
        "*, owner_user:users!owner(*, photo:files!photo_id(*)), following_user:users!following_to(*, photo:files!photo_id(*))"
      )
      .eq("owner", id);

    if (error) {
      console.error("Error while fetching following", error);
      return res.status(500).json({ error: "Something went wrong." });
    }

    return res.status(200).json({ data: following || [] });
  } catch (error) {
    console.error("Error while fetching following", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
