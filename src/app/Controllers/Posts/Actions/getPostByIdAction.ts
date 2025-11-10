import { Request, Response } from "express";
import mongoose from "mongoose";
import { Post } from "../../../Models/Post";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";

export const getPostById = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const user = req.user as UserInterface;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const posts = await Post.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
          deletedAt: null,
          isDeleted: false,
        },
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
          from: "files",
          localField: "userInfo.photoId",
          foreignField: "_id",
          as: "userPhoto",
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
          let: { postId: "$_id", userId: user?._id },
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
        $lookup: {
          from: "userconnections",
          let: { userId: { $arrayElemAt: ["$userInfo._id", 0] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$followingTo", "$$userId"] },
                    { $eq: ["$owner", new mongoose.Types.ObjectId(user._id)] },
                  ],
                },
              },
            },
          ],
          as: "followInfo",
        },
      },

      {
        $addFields: {
          isFollowing: { $gt: [{ $size: "$followInfo" }, 0] },
          isLiked: { $gt: [{ $size: "$likeInteractions" }, 0] },
          isSaved: { $gt: [{ $size: "$savedInteractions" }, 0] },
          // Viewer ownership for modal actions
          isOwner: { $eq: ["$user", new mongoose.Types.ObjectId(user._id)] },
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
        $unset: "followInfo",
      },
      {
        $lookup: {
          from: "users",
          let: { userTags: "$userTags" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ["$_id", "$$userTags.userId"],
                },
              },
            },
            {
              $project: {
                _id: 1,
                userName: 1,
              },
            },
          ],
          as: "userTagsUsers",
        },
      },
      {
        $addFields: {
          userTags: {
            $map: {
              input: "$userTags",
              as: "tag",
              in: {
                $mergeObjects: [
                  "$$tag",
                  {
                    userName: {
                      $arrayElemAt: [
                        "$userTagsUsers.userName",
                        {
                          $indexOfArray: ["$userTagsUsers._id", "$$tag.userId"],
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          userTagsUsers: 0,
        },
      },
    ]);

    if (posts.length === 0) {
      return res.status(404).json({ error: "Post not found", posts });
    }

    return res.json(posts[0]);
  } catch (error) {
    console.error("Error retrieving Post:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
