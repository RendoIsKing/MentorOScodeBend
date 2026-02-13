import { Request, Response } from "express";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { db, findMany, Tables } from "../../../../lib/db";

export const getCommentsByPostId = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    // Fetch all non-deleted comments for this post
    const comments = await findMany(
      Tables.INTERACTIONS,
      {
        post_id: id,
        type: InteractionType.COMMENT,
        is_deleted: false,
      },
      { orderBy: "created_at", ascending: true }
    );

    if (!comments.length) {
      return res
        .status(200)
        .json({ data: [], error: { message: "No comments to show." } });
    }

    // Fetch user info for all commenters
    const userIds = [...new Set(comments.map((c: any) => c.interacted_by))];
    const { data: users } = await db
      .from(Tables.USERS)
      .select("*")
      .in("id", userIds);

    // Fetch user photos
    const photoIds = (users || [])
      .map((u: any) => u.photo_id)
      .filter(Boolean);
    const { data: photos } = photoIds.length
      ? await db.from(Tables.FILES).select("*").in("id", photoIds)
      : { data: [] as any[] };

    const photoMap: Record<string, any> = {};
    for (const p of photos || []) {
      photoMap[p.id] = p;
    }

    const userMap: Record<string, any> = {};
    for (const u of users || []) {
      userMap[u.id] = {
        ...u,
        photo: u.photo_id ? photoMap[u.photo_id] || null : null,
      };
    }

    // Build comment tree using parent_id (replaces replies[] array)
    const commentMap: Record<string, any> = {};
    for (const c of comments) {
      commentMap[c.id] = {
        ...c,
        interactedBy: userMap[c.interacted_by] || null,
        replies: [],
      };
    }

    const topLevel: any[] = [];
    for (const c of comments) {
      if (c.parent_id && commentMap[c.parent_id]) {
        commentMap[c.parent_id].replies.push(commentMap[c.id]);
      } else if (!c.parent_id && !c.is_child_comment) {
        topLevel.push(commentMap[c.id]);
      }
    }

    if (topLevel.length === 0) {
      return res
        .status(200)
        .json({ data: [], error: { message: "No comments to show." } });
    }

    return res.json({
      data: topLevel,
      message: "Comments retrieved successfully.",
    });
  } catch (error) {
    console.log("Error in getting all comments", error);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
