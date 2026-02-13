import { Request, Response } from "express";
import { db, count, updateById, Tables } from "../../../../lib/db";

export const getAdminPosts = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const perPage = Math.max(
      parseInt(String(req.query.perPage || "10"), 10),
      1
    );
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const skip = (page - 1) * perPage;

    const total = await count(Tables.POSTS, { is_deleted: false });

    const { data: posts } = await db
      .from(Tables.POSTS)
      .select(`*, userInfo:users!user_id(*)`)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .range(skip, skip + perPage - 1);

    // Get media for all posts
    const postIds = (posts || []).map((p: any) => p.id);
    const { data: allMedia } = postIds.length
      ? await db.from(Tables.POST_MEDIA).select("*").in("post_id", postIds)
      : { data: [] as any[] };

    const baseUrl = `${req.protocol}://${req.get("host")}/api/backend`;
    const postsWithMedia = (posts || []).map((post: any) => {
      const postMedia = (allMedia || []).filter(
        (m: any) => m.post_id === post.id
      );
      const mediaId = postMedia?.[0]?.media_id;
      const mediaUrl = mediaId
        ? `${baseUrl}/v1/user/files/${String(mediaId)}`
        : null;
      return {
        ...post,
        user: post.userInfo,
        mediaFiles: postMedia,
        mediaUrl,
      };
    });

    return res.json({
      data: postsWithMedia,
      meta: {
        perPage,
        page,
        pages: Math.ceil(total / perPage),
        total,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};

export const deletePostByAdmin = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const post = await updateById(Tables.POSTS, id, {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    });
    if (!post) {
      return res
        .status(404)
        .json({ error: { message: "Post not found." } });
    }
    return res.json({ data: post, message: "Post deleted successfully." });
  } catch (err) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
