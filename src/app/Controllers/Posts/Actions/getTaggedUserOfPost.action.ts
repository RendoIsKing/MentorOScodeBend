import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, findById, Tables } from "../../../../lib/db";

export const getTaggedUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const user = req.user as UserInterface;
    const userId = user._id || user.id;

    // Verify post exists
    const post = await findById(Tables.POSTS, id);
    if (!post || post.is_deleted) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Get user tags for this post
    const { data: userTags } = await db
      .from(Tables.POST_USER_TAGS)
      .select("user_id")
      .eq("post_id", id);

    if (!userTags || userTags.length === 0) {
      return res.json({ taggedUsers: [] });
    }

    const taggedUserIds = userTags.map((t: any) => t.user_id);

    // Fetch tagged user details
    const { data: taggedUsers } = await db
      .from(Tables.USERS)
      .select("id, full_name, user_name, photo_id")
      .in("id", taggedUserIds);

    if (!taggedUsers || taggedUsers.length === 0) {
      return res.json({ taggedUsers: [] });
    }

    // Check follow status for each tagged user
    const { data: followData } = await db
      .from(Tables.USER_CONNECTIONS)
      .select("following_to")
      .eq("owner", userId)
      .in(
        "following_to",
        taggedUsers.map((u: any) => u.id)
      );

    const followingSet = new Set(
      (followData || []).map((f: any) => f.following_to)
    );

    // Fetch photos for tagged users
    const photoIds = taggedUsers
      .map((u: any) => u.photo_id)
      .filter(Boolean);
    const { data: photos } = photoIds.length
      ? await db.from(Tables.FILES).select("id, path").in("id", photoIds)
      : { data: [] as any[] };

    const photoMap: Record<string, any> = {};
    for (const p of photos || []) {
      photoMap[p.id] = p;
    }

    const enrichedUsers = taggedUsers.map((u: any) => ({
      _id: u.id,
      fullName: u.full_name,
      userName: u.user_name,
      photoId: u.photo_id,
      isFollowing: followingSet.has(u.id),
      photo: u.photo_id ? photoMap[u.photo_id] || null : null,
    }));

    return res.json({ taggedUsers: enrichedUsers });
  } catch (error) {
    console.error("Error retrieving tagged users:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
