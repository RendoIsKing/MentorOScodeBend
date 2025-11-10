import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { GetAllItemsInputs } from "../Inputs/getPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { Post } from "../../../Models/Post";
import { commonPaginationPipeline } from "../../../../utils/pipeline/commonPagination";
import { UserInterface } from "../../../../types/UserInterface";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { PostFilterEnum } from "../../../../types/enums/postsFilterEnum";
import { userConnection } from "../../../Models/Connection";
import { Types } from "mongoose";
import { Subscription } from "../../../Models/Subscription";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";

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
    // Optional toggle to include the requesting user's own posts in the feed
    const includeSelfParam = (
      (req.query.includeSelf as string) || ""
    ).toString().toLowerCase();
    const includeSelfRequested = ["true", "1", "yes"].includes(includeSelfParam);
    // Default behavior: for FOR_YOU feed, always include self posts
    const includeSelf = filter === PostFilterEnum.FOR_YOU ? true : includeSelfRequested;

    let skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    let matchStage: any = {
      _id: { $exists: true },
      type: PostType.POST,
      user: includeSelf
        ? { $exists: true }
        : {
            $exists: true,
            $ne: new Types.ObjectId(user._id),
          },
      deletedAt: null,
      isDeleted: false,
    };

    if (filter === PostFilterEnum.ALL) {
      // Public feed: only PUBLIC posts from anyone (optionally exclude own)
      matchStage.privacy = 'public';
    }

    if (filter === PostFilterEnum.FOLLOWING) {
      const userConnections = await userConnection.find(
        { owner: user.id },
        { followingTo: 1 }
      );

      const followedUserIds = userConnections.map((conn) => conn.followingTo);

      matchStage.user = { $in: followedUserIds };
      // Followers feed: allow PUBLIC and FOLLOWERS visibility
      matchStage.privacy = { $in: ['public','followers'] } as any;
    }

    if (filter === PostFilterEnum.SUBSCRIBED) {
      const subscriptions = await Subscription.find(
        { userId: user.id, status: SubscriptionStatusEnum.ACTIVE },
        { planId: 1 }
      );

      const planIds = subscriptions.map((sub) => sub.planId);

      const subscriptionPlans = await SubscriptionPlan.find(
        { _id: { $in: planIds }, isDeleted: false, deletedAt: null },
        { userId: 1 }
      );

      const subscribedUserIds = subscriptionPlans.map((plan) => plan.userId);

      matchStage.user = { $in: subscribedUserIds };
      // Subscribed feed: allow PUBLIC and SUBSCRIBER visibility
      matchStage.privacy = { $in: ['public','subscriber'] } as any;
    }
    // else if (filter === PostFilterEnum.FOR_YOU) {
    // }

    if (search) {
      matchStage = {
        ...matchStage,
        $or: [
          { content: { $regex: search, $options: "i" } },
          { tags: { $regex: search, $options: "i" } },
        ],
      };
    }

    const posts = await Post.aggregate([
      { $match: matchStage },
      // ...(isFollowing
      //   ? [
      //       {
      //         $lookup: {
      //           from: "userconnections",
      //           let: { userId: "$user" },
      //           pipeline: [
      //             {
      //               $match: {
      //                 $expr: {
      //                   $and: [
      //                     { $eq: ["$owner", user._id] },
      //                     { $eq: ["$followingTo", "$$userId"] },
      //                   ],
      //                 },
      //               },
      //             },
      //           ],
      //           as: "connections",
      //         },
      //       },
      //       {
      //         $match: {
      //           "connections.0": { $exists: true },
      //         },
      //       },
      //     ]
      //   : []),
      {
        $lookup: {
          from: "files",
          localField: "media.mediaId",
          foreignField: "_id",
          as: "mediaFiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "userInfo.photoId",
          foreignField: "_id",
          as: "userPhoto",
        },
      },
      // {
      //   $addFields: {
      //     "userInfo.photo": { $arrayElemAt: ["$userPhoto", 0] },
      //   },
      // },

      {
        $lookup: {
          from: "interactions",
          let: { postId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$post", "$$postId"] },
                    { $eq: ["$type", InteractionType.LIKE_POST] },
                  ],
                },
              },
            },
            {
              $count: "likesCount",
            },
          ],
          as: "likesCount",
        },
      },
      {
        $lookup: {
          from: "interactions",
          let: { postId: "$_id", userId: user?._id },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$post", "$$postId"] },
                    { $eq: ["$interactedBy", "$$userId"] },
                    { $eq: ["$type", InteractionType.LIKE_POST] },
                  ],
                },
              },
            },
          ],
          as: "likeInteractions", //for isLiked key
        },
      },
      {
        $lookup: {
          from: "interactions",
          let: { postId: "$_id", userId: user._id },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$post", "$$postId"] },
                    { $eq: ["$interactedBy", "$$userId"] },
                    { $eq: ["$type", InteractionType.COLLECTION_SAVED] },
                  ],
                },
              },
            },
          ],
          as: "savedInteractions", //for isSaved Key
        },
      },
      {
        $lookup: {
          from: "interactions",
          let: { postId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$post", "$$postId"] },
                    { $eq: ["$type", InteractionType.COLLECTION_SAVED] },
                  ],
                },
              },
            },
            {
              $count: "savedCount",
            },
          ],
          as: "savedCount",
        },
      },

      {
        $lookup: {
          from: "interactions",
          let: { postId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$post", "$$postId"] },
                    { $eq: ["$type", InteractionType.COMMENT] },
                    { $eq: ["$isDeleted", false] },
                  ],
                },
              },
            },
            {
              $count: "commentsCount",
            },
          ],
          as: "commentsCount",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$likeInteractions" }, 0] },
          isSaved: { $gt: [{ $size: "$savedInteractions" }, 0] },
          // Viewer ownership flag for easier UI logic
          isOwner: { $eq: ["$user", new Types.ObjectId(user._id)] },
          commentsCount: {
            $ifNull: [{ $arrayElemAt: ["$commentsCount.commentsCount", 0] }, 0],
          },
          savedCount: {
            $ifNull: [{ $arrayElemAt: ["$savedCount.savedCount", 0] }, 0],
          },
          likesCount: {
            $ifNull: [{ $arrayElemAt: ["$likesCount.likesCount", 0] }, 0],
          },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      ...commonPaginationPipeline(page as number, perPage as number, skip),
    ]);
    let data = {
      data: posts[0]?.data ?? [],
      meta: posts[0]?.metaData?.[0] ?? {},
    };

    return res.json(data);
  } catch (err) {
    console.log("Error while retrieving posts", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
