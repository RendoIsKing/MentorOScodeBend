import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { GetAllItemsInputs } from "../Inputs/getPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { Post } from "../../../Models/Post";
import { commonPaginationPipeline } from "../../../../utils/pipeline/commonPagination";
import { User } from "../../../Models/User";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { Types } from "mongoose";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { PostFilterEnum } from "../../../../types/enums/postsFilterEnum";
import { userConnection } from "../../../Models/Connection";
import { Interaction } from "../../../Models/Interaction";

export const getPostsOfUserByUserName = async (req: Request, res: Response) => {
  try {
    const { userName } = req.query;
    if (!userName) {
      return res
        .status(400)
        .json({ error: "userName query parameter is required." });
    }

    const user = await User.findOne({ userName });

    if (!user) {
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

    let skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    let matchCondition: any = {
      _id: { $exists: true },
      user: { $exists: true },
      type: PostType.POST,
      deletedAt: null,
      isDeleted: false,
    };

    if (filter === PostFilterEnum.POSTS) {
      matchCondition.user = new Types.ObjectId(user.id);
    } else if (filter === PostFilterEnum.TAGGED) {
      matchCondition["userTags.userId"] = new Types.ObjectId(user.id);
    } else if (filter === PostFilterEnum.FOLLOWING) {
      const userConnections = await userConnection.find(
        { owner: user.id },
        { followingTo: 1 }
      );

      const followedUserIds = userConnections.map((conn) => conn.followingTo);

      matchCondition.user = { $in: followedUserIds };
    } else if (filter === PostFilterEnum.LIKED) {
      const likedPosts = await Interaction.find({
        type: InteractionType.LIKE_POST,
        interactedBy: user.id,
      });

      const likedPostIds = likedPosts.map((like) => like.post);

      matchCondition._id = { $in: likedPostIds };
    } else if (filter === PostFilterEnum.SAVED) {
      const savedPosts = await Interaction.find({
        type: InteractionType.COLLECTION_SAVED,
        interactedBy: user.id,
      });

      const savedPostIds = savedPosts.map((save) => save.post);

      matchCondition._id = { $in: savedPostIds };
    }
    const posts = await Post.aggregate([
      {
        $match: matchCondition,
      },
      // {
      //   $unwind: "$media",
      // },
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
          from: "transactions",
          let: { stripeProductId: "$stripeProductId", userId: user?._id },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$stripeProductId", "$$stripeProductId"] },
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: ["$status", TransactionStatus.SUCCESS] },
                  ],
                },
              },
            },
            {
              $limit: 1,
            },
          ],
          as: "paidTransactions",
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
          as: "likeInteractions",
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
          as: "savedInteractions",
        },
      },

      {
        $addFields: {
          isPaid: { $gt: [{ $size: "$paidTransactions" }, 0] },
          isLiked: { $gt: [{ $size: "$likeInteractions" }, 0] },
          isSaved: { $gt: [{ $size: "$savedInteractions" }, 0] },
          likesCount: {
            $ifNull: [{ $arrayElemAt: ["$likesCount.likesCount", 0] }, 0],
          },
          savedCount: {
            $ifNull: [{ $arrayElemAt: ["$savedCount.savedCount", 0] }, 0],
          },
        },
      },
      {
        $unset: "paidTransactions",
      },
      {
        $sort: {
          isPinned: -1,
          createdAt: -1,
        },
      },

      ...commonPaginationPipeline(page as number, perPage as number, skip),
    ]);
    let data = {
      data: posts[0]?.data ?? [],
      meta: posts[0]?.metaData?.[0] ?? {},
    };

    return res.json(data);
  } catch (err) {
    console.log("Error while getting posts of user", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
