import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { GetAllItemsInputs } from "../Inputs/getPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { PostFilterEnum } from "../../../../types/enums/postsFilterEnum";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { UserInterface } from "../../../../types/UserInterface";
import { db, findMany, Tables } from "../../../../lib/db";

export const getPostsOfUserByUserName = async (
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

    const viewer = req.user as UserInterface;
    const viewerId = viewer._id || viewer.id;

    // Resolve user by username (case-insensitive) or by ID
    let profileUser: any = null;
    const { data: byName } = await db
      .from(Tables.USERS)
      .select("id, user_name")
      .ilike("user_name", String(userName))
      .limit(1)
      .maybeSingle();

    if (byName) {
      profileUser = byName;
    } else {
      // Try to resolve by ID
      const { data: byId } = await db
        .from(Tables.USERS)
        .select("id, user_name")
        .eq("id", String(userName))
        .maybeSingle();
      profileUser = byId;
    }

    if (!profileUser) {
      return res.status(404).json({ error: "User not found." });
    }

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

    const { perPage, page, filter } = postQuery;
    const skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    // Pre-compute filter-specific post IDs
    let filterPostIds: string[] | null = null;
    let filterUserIds: string[] | null = null;

    if (filter === PostFilterEnum.TAGGED) {
      const { data: tagged } = await db
        .from(Tables.POST_USER_TAGS)
        .select("post_id")
        .eq("user_id", profileUser.id);
      filterPostIds = (tagged || []).map((t: any) => t.post_id);
      if (!filterPostIds.length) {
        return res.json({
          data: [],
          meta: { total: 0, page, perPage, pageCount: 0 },
        });
      }
    } else if (filter === PostFilterEnum.FOLLOWING) {
      const connections = await findMany(
        Tables.USER_CONNECTIONS,
        { owner: profileUser.id },
        { select: "following_to" }
      );
      filterUserIds = connections.map((c: any) => c.following_to);
      if (!filterUserIds.length) {
        return res.json({
          data: [],
          meta: { total: 0, page, perPage, pageCount: 0 },
        });
      }
    } else if (filter === PostFilterEnum.LIKED) {
      const liked = await findMany(
        Tables.INTERACTIONS,
        { type: InteractionType.LIKE_POST, interacted_by: profileUser.id },
        { select: "post_id" }
      );
      filterPostIds = liked.map((l: any) => l.post_id);
      if (!filterPostIds.length) {
        return res.json({
          data: [],
          meta: { total: 0, page, perPage, pageCount: 0 },
        });
      }
    } else if (filter === PostFilterEnum.SAVED) {
      const saved = await findMany(
        Tables.INTERACTIONS,
        {
          type: InteractionType.COLLECTION_SAVED,
          interacted_by: profileUser.id,
        },
        { select: "post_id" }
      );
      filterPostIds = saved.map((s: any) => s.post_id);
      if (!filterPostIds.length) {
        return res.json({
          data: [],
          meta: { total: 0, page, perPage, pageCount: 0 },
        });
      }
    }

    // Build query
    let query = db
      .from(Tables.POSTS)
      .select(
        `*, userInfo:users!user_id(id, full_name, user_name, photo_id)`,
        { count: "exact" }
      )
      .eq("is_deleted", false)
      .eq("type", PostType.POST);

    if (filter === PostFilterEnum.POSTS || !filter) {
      query = query.eq("user_id", profileUser.id);
    } else if (filterPostIds) {
      query = query.in("id", filterPostIds);
    } else if (filterUserIds) {
      query = query.in("user_id", filterUserIds);
    }

    const { data: posts, count: total } = await query
      .order("is_pinned", { ascending: false })
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
      likesResult,
      savedResult,
      userLikesResult,
      userSavedResult,
      transactionsResult,
    ] = await Promise.all([
      db.from(Tables.POST_MEDIA).select("*").in("post_id", postIds),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.LIKE_POST),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.COLLECTION_SAVED),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.LIKE_POST)
        .eq("interacted_by", viewerId),
      db
        .from(Tables.INTERACTIONS)
        .select("post_id")
        .in("post_id", postIds)
        .eq("type", InteractionType.COLLECTION_SAVED)
        .eq("interacted_by", viewerId),
      (() => {
        const stripeIds = posts
          .map((p: any) => p.stripe_product_id)
          .filter(Boolean);
        return stripeIds.length
          ? db
              .from(Tables.TRANSACTIONS)
              .select("stripe_product_id")
              .in("stripe_product_id", stripeIds)
              .eq("user_id", viewerId)
              .eq("status", TransactionStatus.SUCCESS)
          : Promise.resolve({ data: [] as any[] });
      })(),
    ]);

    // Build maps
    const buildCountMap = (rows: any[]) => {
      const map: Record<string, number> = {};
      for (const row of rows || []) {
        map[row.post_id] = (map[row.post_id] || 0) + 1;
      }
      return map;
    };
    const buildIdSet = (rows: any[], key = "post_id") =>
      new Set((rows || []).map((r: any) => r[key]));

    const likeCountMap = buildCountMap(likesResult.data);
    const savedCountMap = buildCountMap(savedResult.data);
    const userLikeSet = buildIdSet(userLikesResult.data);
    const userSavedSet = buildIdSet(userSavedResult.data);
    const paidProductSet = buildIdSet(
      transactionsResult.data,
      "stripe_product_id"
    );

    const enrichedPosts = posts.map((post: any) => ({
      ...post,
      mediaFiles: (mediaResult.data || []).filter(
        (m: any) => m.post_id === post.id
      ),
      userInfo: post.userInfo ? [post.userInfo] : [],
      isPaid: post.stripe_product_id
        ? paidProductSet.has(post.stripe_product_id)
        : false,
      isLiked: userLikeSet.has(post.id),
      isSaved: userSavedSet.has(post.id),
      likesCount: likeCountMap[post.id] || 0,
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
    console.log("Error while getting posts of user", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
