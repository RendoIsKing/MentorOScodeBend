import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { db, Tables } from "../../../../lib/db";

export const getPostById = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const user = req.user as UserInterface;
    const userId = user._id || user.id;

    // Fetch the post with user info
    const { data: post, error } = await db
      .from(Tables.POSTS)
      .select(
        `*, userInfo:users!user_id(id, full_name, user_name, photo_id)`
      )
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (error || !post) {
      return res.status(404).json({ error: "Post not found", posts: [] });
    }

    // Fetch related data in parallel
    const [
      mediaResult,
      userPhotoResult,
      likesCountResult,
      userLikeResult,
      userSavedResult,
      savedCountResult,
      commentsCountResult,
      followResult,
      userTagsResult,
    ] = await Promise.all([
      db.from(Tables.POST_MEDIA).select("*").eq("post_id", id),
      post.userInfo?.photo_id
        ? db.from(Tables.FILES).select("*").eq("id", post.userInfo.photo_id)
        : Promise.resolve({ data: [] as any[] }),
      db
        .from(Tables.INTERACTIONS)
        .select("id", { count: "exact", head: true })
        .eq("post_id", id)
        .eq("type", InteractionType.LIKE_POST),
      db
        .from(Tables.INTERACTIONS)
        .select("id")
        .eq("post_id", id)
        .eq("type", InteractionType.LIKE_POST)
        .eq("interacted_by", userId)
        .limit(1),
      db
        .from(Tables.INTERACTIONS)
        .select("id")
        .eq("post_id", id)
        .eq("type", InteractionType.COLLECTION_SAVED)
        .eq("interacted_by", userId)
        .limit(1),
      db
        .from(Tables.INTERACTIONS)
        .select("id", { count: "exact", head: true })
        .eq("post_id", id)
        .eq("type", InteractionType.COLLECTION_SAVED),
      db
        .from(Tables.INTERACTIONS)
        .select("id", { count: "exact", head: true })
        .eq("post_id", id)
        .eq("type", InteractionType.COMMENT)
        .eq("is_deleted", false),
      post.userInfo?.id
        ? db
            .from(Tables.USER_CONNECTIONS)
            .select("id")
            .eq("following_to", post.userInfo.id)
            .eq("owner", userId)
            .limit(1)
        : Promise.resolve({ data: [] as any[] }),
      db.from(Tables.POST_USER_TAGS).select("*").eq("post_id", id),
    ]);

    // Resolve user tag usernames
    let enrichedUserTags = userTagsResult.data || [];
    if (enrichedUserTags.length > 0) {
      const tagUserIds = enrichedUserTags.map((t: any) => t.user_id);
      const { data: tagUsers } = await db
        .from(Tables.USERS)
        .select("id, user_name")
        .in("id", tagUserIds);
      const tagUserMap: Record<string, string> = {};
      for (const u of tagUsers || []) {
        tagUserMap[u.id] = u.user_name;
      }
      enrichedUserTags = enrichedUserTags.map((tag: any) => ({
        ...tag,
        userName: tagUserMap[tag.user_id] || tag.user_name,
      }));
    }

    const result = {
      ...post,
      mediaFiles: mediaResult.data || [],
      userInfo: post.userInfo ? [post.userInfo] : [],
      userPhoto: userPhotoResult.data || [],
      isFollowing: (followResult.data || []).length > 0,
      isLiked: (userLikeResult.data || []).length > 0,
      isSaved: (userSavedResult.data || []).length > 0,
      isOwner: post.user_id === userId,
      likesCount: likesCountResult.count || 0,
      savedCount: savedCountResult.count || 0,
      commentsCount: commentsCountResult.count || 0,
      userTags: enrichedUserTags,
    };

    return res.json(result);
  } catch (error) {
    console.error("Error retrieving Post:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
