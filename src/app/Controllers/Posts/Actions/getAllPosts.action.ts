import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { GetAllItemsInputs } from "../Inputs/getPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { UserInterface } from "../../../../types/UserInterface";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { PostFilterEnum } from "../../../../types/enums/postsFilterEnum";
import { db, findMany, Tables } from "../../../../lib/db";

export const getAllPostsActions = async (req: Request, res: Response) => {
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

    const { perPage, page, filter, search } = postQuery;
    const includeSelfParam = (
      (req.query.includeSelf as string) || ""
    )
      .toString()
      .toLowerCase();
    const includeSelfRequested = ["true", "1", "yes"].includes(
      includeSelfParam
    );
    const includeSelf =
      filter === PostFilterEnum.FOR_YOU ? true : includeSelfRequested;

    const skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    const userId = user._id || user.id;

    // Build query
    let query = db
      .from(Tables.POSTS)
      .select(
        `*, userInfo:users!user_id(id, full_name, user_name, photo_id)`,
        { count: "exact" }
      )
      .eq("is_deleted", false)
      .eq("type", PostType.POST);

    if (!includeSelf) {
      query = query.neq("user_id", userId);
    }

    if (filter === PostFilterEnum.ALL) {
      query = query.eq("privacy", "public");
    }

    if (filter === PostFilterEnum.FOLLOWING) {
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
      query = query
        .in("user_id", followedIds)
        .in("privacy", ["public", "followers"]);
    }

    if (filter === PostFilterEnum.SUBSCRIBED) {
      const subscriptions = await findMany(
        Tables.SUBSCRIPTIONS,
        { user_id: userId, status: "active" },
        { select: "plan_id" }
      );
      const planIds = subscriptions.map((s: any) => s.plan_id);
      if (planIds.length === 0) {
        return res.json({
          data: [],
          meta: { total: 0, page, perPage, pageCount: 0 },
        });
      }
      const plans = await findMany(
        Tables.SUBSCRIPTION_PLANS,
        { id: planIds, is_deleted: false },
        { select: "user_id" }
      );
      const subscribedUserIds = plans.map((p: any) => p.user_id);
      if (subscribedUserIds.length === 0) {
        return res.json({
          data: [],
          meta: { total: 0, page, perPage, pageCount: 0 },
        });
      }
      query = query
        .in("user_id", subscribedUserIds)
        .in("privacy", ["public", "subscriber"]);
    }

    if (search) {
      query = query.or(
        `content.ilike.%${search}%,tags.cs.{${search}}`
      );
    }

    // Execute with pagination
    const { data: posts, count: total } = await query
      .order("created_at", { ascending: false })
      .range(skip, skip + (perPage as number) - 1);

    if (!posts || !posts.length) {
      return res.json({
        data: [],
        meta: { total: 0, page, perPage, pageCount: 0 },
      });
    }

    const postIds = posts.map((p: any) => p.id);

    // Fetch related data in parallel
    const [
      mediaResult,
      userPhotoResult,
      likesResult,
      userLikesResult,
      userSavedResult,
      commentsResult,
      savedResult,
    ] = await Promise.all([
      db.from(Tables.POST_MEDIA).select("*").in("post_id", postIds),
      (() => {
        const photoIds = posts
          .map((p: any) => p.userInfo?.photo_id)
          .filter(Boolean);
        return photoIds.length
          ? db.from(Tables.FILES).select("*").in("id", photoIds)
          : Promise.resolve({ data: [] as any[] });
      })(),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.LIKE_POST),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.LIKE_POST)
        .eq("interacted_by", userId),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.COLLECTION_SAVED)
        .eq("interacted_by", userId),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.COMMENT)
        .eq("is_deleted", false),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.COLLECTION_SAVED),
    ]);

    // Build count maps
    const buildCountMap = (rows: any[]) => {
      const map: Record<string, number> = {};
      for (const row of rows || []) {
        map[row.post_id] = (map[row.post_id] || 0) + 1;
      }
      return map;
    };
    const buildIdSet = (rows: any[]) =>
      new Set((rows || []).map((r: any) => r.post_id));

    const likeCountMap = buildCountMap(likesResult.data || []);
    const commentCountMap = buildCountMap(commentsResult.data || []);
    const savedCountMap = buildCountMap(savedResult.data || []);
    const userLikeSet = buildIdSet(userLikesResult.data || []);
    const userSavedSet = buildIdSet(userSavedResult.data || []);

    const photoMap: Record<string, any> = {};
    for (const photo of userPhotoResult.data || []) {
      photoMap[photo.id] = photo;
    }

    // Enrich posts
    const enrichedPosts = posts.map((post: any) => ({
      ...post,
      mediaFiles: (mediaResult.data || []).filter(
        (m: any) => m.post_id === post.id
      ),
      userInfo: post.userInfo ? [post.userInfo] : [],
      userPhoto: post.userInfo?.photo_id
        ? [photoMap[post.userInfo.photo_id]].filter(Boolean)
        : [],
      isLiked: userLikeSet.has(post.id),
      isSaved: userSavedSet.has(post.id),
      isOwner: post.user_id === userId,
      likesCount: likeCountMap[post.id] || 0,
      commentsCount: commentCountMap[post.id] || 0,
      savedCount: savedCountMap[post.id] || 0,
    }));

    return res.json({
      data: enrichedPosts,
      meta: {
        total: total || 0,
        page,
        perPage,
        pageCount: Math.ceil((total || 0) / (perPage as number)),
      },
    });
  } catch (err) {
    console.log("Error while retrieving posts", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
