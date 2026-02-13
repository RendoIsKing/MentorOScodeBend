import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { GetAllItemsInputs } from "../Inputs/getPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { Privacy } from "../../../../types/enums/privacyEnums";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { UserInterface } from "../../../../types/UserInterface";
import { db, findOne, Tables } from "../../../../lib/db";
import { twentyFourHoursAgo } from "./getAllStoriesAction";

export const getStoriesOfUserByUserName = async (
  req: Request,
  res: Response
) => {
  try {
    const { userName } = req.query;
    if (!userName) {
      return res
        .status(400)
        .json({ error: "userName query parameter is required." });
    }

    const profileUser = await findOne(Tables.USERS, {
      user_name: String(userName),
    });

    if (!profileUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const loggedInUser = req.user as UserInterface;
    const loggedInUserId = loggedInUser._id || loggedInUser.id;

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

    // Fetch stories
    const { data: stories, count: total } = await db
      .from(Tables.POSTS)
      .select("*", { count: "exact" })
      .eq("user_id", profileUser.id)
      .eq("type", PostType.STORY)
      .eq("privacy", Privacy.PUBLIC)
      .eq("is_deleted", false)
      .gte("created_at", twentyFourHoursAgo.toISOString())
      .order("created_at", { ascending: false })
      .range(skip, skip + (perPage as number) - 1);

    if (!stories || !stories.length) {
      return res.json({
        data: [],
        meta: { total: 0, page, perPage, pageCount: 0 },
      });
    }

    const storyIds = stories.map((s: any) => s.id);

    // Fetch media and like status in parallel
    const [mediaResult, userLikesResult, userPhotoResult] = await Promise.all([
      db.from(Tables.POST_MEDIA).select("*").in("post_id", storyIds),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", storyIds)
        .eq("type", InteractionType.LIKE_STORY)
        .eq("interacted_by", loggedInUserId),
      profileUser.photo_id
        ? db
            .from(Tables.FILES)
            .select("*")
            .eq("id", profileUser.photo_id)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const userLikeSet = new Set(
      (userLikesResult.data || []).map((r: any) => r.post_id)
    );

    // Build userInfo object (unwound, matching the original $unwind)
    const userInfo = {
      ...profileUser,
      photo: userPhotoResult.data || [],
    };

    const enrichedStories = stories.map((story: any) => ({
      _id: story.id,
      user: story.user_id,
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
      userInfo,
      isLiked: userLikeSet.has(story.id),
    }));

    return res.json({
      data: enrichedStories,
      meta: {
        total: total || 0,
        page,
        perPage,
        pageCount: Math.ceil((total || 0) / (perPage as number)),
      },
    });
  } catch (err) {
    console.log("Error while getting stories of user", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
