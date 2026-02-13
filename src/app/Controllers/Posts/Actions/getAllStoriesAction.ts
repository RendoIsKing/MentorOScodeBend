import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { GetAllItemsInputs } from "../Inputs/getPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { UserInterface } from "../../../../types/UserInterface";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { db, findMany, Tables } from "../../../../lib/db";

export const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

export const getAllStoriesActions = async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    const postQuery = plainToClass(GetAllItemsInputs, req.query);
    const errors = await validate(postQuery);
    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res
        .status(400)
        .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
    }

    const { perPage, page } = postQuery;
    const skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    const userId = user._id || user.id;

    // Get followed user IDs
    const connections = await findMany(
      Tables.USER_CONNECTIONS,
      { owner: userId },
      { select: "following_to" }
    );
    const followedIds = connections.map((c: any) => c.following_to);

    if (followedIds.length === 0) {
      return res.json({
        data: [],
        meta: { total: 0, page, perPage, pageCount: 0 },
      });
    }

    // Fetch stories from followed users within 24h
    const { data: stories, count: _total } = await db
      .from(Tables.POSTS)
      .select("*", { count: "exact" })
      .eq("type", PostType.STORY)
      .eq("is_deleted", false)
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .in("user_id", followedIds)
      .order("created_at", { ascending: false });

    if (!stories || !stories.length) {
      return res.json({
        data: [],
        meta: { total: 0, page, perPage, pageCount: 0 },
      });
    }

    const storyIds = stories.map((s: any) => s.id);

    // Fetch media and user info in parallel
    const [mediaResult, userLikesResult] = await Promise.all([
      db.from(Tables.POST_MEDIA).select("*").in("post_id", storyIds),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", storyIds)
        .eq("type", InteractionType.LIKE_STORY)
        .eq("interacted_by", userId),
    ]);

    // Fetch unique user IDs and their info
    const uniqueUserIds = [...new Set(stories.map((s: any) => s.user_id))];
    const { data: users } = await db
      .from(Tables.USERS)
      .select("*")
      .in("id", uniqueUserIds);

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
        photo: u.photo_id ? [photoMap[u.photo_id]].filter(Boolean) : [],
      };
    }

    const userLikeSet = new Set(
      (userLikesResult.data || []).map((r: any) => r.post_id)
    );

    // Group stories by user
    const groupedByUser: Record<string, any[]> = {};
    for (const story of stories) {
      if (!groupedByUser[story.user_id]) {
        groupedByUser[story.user_id] = [];
      }
      groupedByUser[story.user_id].push({
        _id: story.id,
        media: (mediaResult.data || [])
          .filter((m: any) => m.post_id === story.id)
          .map((m: any) => ({ mediaId: m.media_id, mediaType: m.media_type })),
        content: story.content,
        isActive: story.is_active,
        isDeleted: story.is_deleted,
        type: story.type,
        createdAt: story.created_at,
        updatedAt: story.updated_at,
        mediaFiles: (mediaResult.data || []).filter(
          (m: any) => m.post_id === story.id
        ),
        isLiked: userLikeSet.has(story.id),
      });
    }

    // Format grouped stories matching the original $group → $project shape
    const allGrouped = Object.entries(groupedByUser).map(
      ([uId, userStories]) => ({
        userInfo: {
          ...(userMap[uId] || {}),
          stories: userStories,
        },
      })
    );

    // Paginate in-memory (the original pipeline paginates after grouping)
    const paginatedData = allGrouped.slice(skip, skip + (perPage as number));
    const totalGroups = allGrouped.length;

    return res.json({
      data: paginatedData,
      meta: {
        total: totalGroups,
        page,
        perPage,
        pageCount: Math.ceil(totalGroups / (perPage as number)),
      },
    });
  } catch (err) {
    console.log("Error while getting stories", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
