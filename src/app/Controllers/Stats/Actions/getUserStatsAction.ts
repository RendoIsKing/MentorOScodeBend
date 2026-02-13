import { Request, Response } from "express";
import { db, findOne, count, Tables } from "../../../../lib/db";
import { PostType } from "../../../../types/enums/postTypeEnum";

export const getUserStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { username } = req.params;
  try {
    const userExists = await findOne(Tables.USERS, {
      user_name: username,
      is_deleted: false,
    });
    if (!userExists) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    const userId = userExists.id;

    // Get user with photo and cover photo
    const { data: userData } = await db
      .from(Tables.USERS)
      .select("*, photo:files!photo_id(*), cover_photo:files!cover_photo_id(*)")
      .eq("id", userId)
      .single();

    // Get subscription plans
    const { data: subscriptionPlans } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("*")
      .eq("user_id", userId)
      .eq("is_deleted", false);

    // Get followers count
    const followersCount = await count(Tables.USER_CONNECTIONS, {
      following_to: userId,
    });

    // Get following count
    const followingCount = await count(Tables.USER_CONNECTIONS, {
      owner: userId,
    });

    // Get posts count
    const postsCount = await count(Tables.POSTS, {
      user_id: userId,
      is_deleted: false,
      type: PostType.POST,
    });

    // Get total likes count on all user posts
    const { data: userPosts } = await db
      .from(Tables.POSTS)
      .select("id")
      .eq("user_id", userId)
      .eq("is_deleted", false);

    let totalLikes = 0;
    if (userPosts && userPosts.length > 0) {
      const postIds = userPosts.map((p: any) => p.id);
      const { count: likesCount } = await db
        .from(Tables.INTERACTIONS)
        .select("id", { count: "exact", head: true })
        .in("post_id", postIds)
        .eq("type", "LIKE_POST")
        .eq("is_deleted", false);
      totalLikes = likesCount || 0;
    }

    return res.json({
      data: {
        ...userData,
        subscriptionPlans: subscriptionPlans || [],
        followersCount,
        followingCount,
        postsCount,
        totalLikes,
      },
    });
  } catch (err) {
    console.error(err, "Error fetching user stats");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
