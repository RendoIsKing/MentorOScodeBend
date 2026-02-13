import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";

export const getFollowers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    // Get followers with user details and photos
    const { data: followers, error } = await db
      .from(Tables.USER_CONNECTIONS)
      .select(
        "*, owner_user:users!owner(*, photo:files!photo_id(*)), following_user:users!following_to(*, photo:files!photo_id(*))"
      )
      .eq("following_to", id);

    if (error) {
      console.error("Error while fetching followers", error);
      return res.status(500).json({ error: "Something went wrong." });
    }

    // Check if the profile owner follows each follower back
    const enriched = await Promise.all(
      (followers || []).map(async (f: any) => {
        const { count: followBackCount } = await db
          .from(Tables.USER_CONNECTIONS)
          .select("id", { count: "exact", head: true })
          .eq("owner", id)
          .eq("following_to", f.owner);

        return {
          ...f,
          isFollowingBack: (followBackCount || 0) > 0,
        };
      })
    );

    return res.status(200).json({ data: enriched });
  } catch (error) {
    console.error("Error while fetching followers", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
