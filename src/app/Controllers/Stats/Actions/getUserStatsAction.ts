import { Request, Response } from "express";
import { User } from "../../../Models/User";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { Types } from "mongoose";
import { PostType } from "../../../../types/enums/postTypeEnum";

export const getUserStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { username } = req.params;
  try {
    const userExists = await User.findOne({
      userName: username,
      isDeleted: false,
    });
    const userId = userExists?.id;

    const [result] = await User.aggregate([
      { $match: { _id: new Types.ObjectId(userId) } },
      {
        $lookup: {
          from: "files",
          localField: "photoId",
          foreignField: "_id",
          as: "photo",
        },
      },
      {
        $addFields: {
          photo: {
            $cond: {
              if: { $eq: [{ $size: "$photo" }, 0] },
              then: null,
              else: { $arrayElemAt: ["$photo", 0] },
            },
          },
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "coverPhotoId",
          foreignField: "_id",
          as: "coverPhoto",
        },
      },
      {
        $addFields: {
          coverPhoto: {
            $cond: {
              if: { $eq: [{ $size: "$coverPhoto" }, 0] },
              then: null,
              else: { $arrayElemAt: ["$coverPhoto", 0] },
            },
          },
        },
      },
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "_id",
          foreignField: "userId",
          as: "subscriptionPlans",
        },
      },
      {
        $addFields: {
          subscriptionPlans: {
            $filter: {
              input: "$subscriptionPlans",
              as: "plan",
              cond: { $eq: ["$$plan.isDeleted", false] },
            },
          },
        },
      },
      {
        $facet: {
          user: [{ $limit: 1 }],
          followersCount: [
            {
              $lookup: {
                from: "userconnections",
                let: { userId: "$_id" },
                pipeline: [
                  {
                    $match: { $expr: { $eq: ["$followingTo", "$$userId"] } },
                  },
                  { $count: "count" },
                ],
                as: "followers",
              },
            },
            {
              $addFields: {
                count: { $arrayElemAt: ["$followers.count", 0] },
              },
            },
          ],
          followingCount: [
            {
              $lookup: {
                from: "userconnections",
                let: { userId: "$_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$owner", "$$userId"] } } },
                  { $count: "count" },
                ],
                as: "following",
              },
            },
            {
              $addFields: {
                count: { $arrayElemAt: ["$following.count", 0] },
              },
            },
          ],
          postsCount: [
            {
              $lookup: {
                from: "posts",
                let: { userId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$user", "$$userId"] },
                          { $eq: ["$isDeleted", false] },
                          { $eq: ["$type", PostType.POST] },
                        ],
                      },
                    },
                  },
                  { $count: "count" },
                ],
                as: "posts",
              },
            },
            {
              $addFields: {
                count: { $arrayElemAt: ["$posts.count", 0] },
              },
            },
          ],
          likesCount: [
            {
              $lookup: {
                from: "posts",
                let: { userId: "$_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$user", "$$userId"] } } },
                  { $project: { _id: 1 } },
                ],
                as: "userPosts",
              },
            },
            { $unwind: "$userPosts" },
            {
              $lookup: {
                from: "interactions",
                let: { postId: "$userPosts._id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$post", "$$postId"] },
                          { $eq: ["$type", InteractionType.LIKE_POST] },
                          { $eq: ["$isDeleted", false] },
                        ],
                      },
                    },
                  },
                  { $count: "count" },
                ],
                as: "likes",
              },
            },
            {
              $group: {
                _id: null,
                totalLikes: { $sum: { $arrayElemAt: ["$likes.count", 0] } },
              },
            },
            {
              $addFields: {
                totalLikes: { $ifNull: ["$totalLikes", 0] },
              },
            },
          ],
        },
      },
      {
        $project: {
          user: { $arrayElemAt: ["$user", 0] },
          followersCount: {
            $ifNull: [{ $arrayElemAt: ["$followersCount.count", 0] }, 0],
          },
          followingCount: {
            $ifNull: [{ $arrayElemAt: ["$followingCount.count", 0] }, 0],
          },
          postsCount: {
            $ifNull: [{ $arrayElemAt: ["$postsCount.count", 0] }, 0],
          },
          totalLikes: {
            $ifNull: [{ $arrayElemAt: ["$likesCount.totalLikes", 0] }, 0],
          },
        },
      },
    ]);

    if (result && result.user) {
      return res.json({
        data: {
          ...result.user,
          followersCount: result.followersCount,
          followingCount: result.followingCount,
          postsCount: result.postsCount,
          totalLikes: result.totalLikes,
        },
      });
    }

    return res.status(404).json({ error: { message: "User not found." } });
  } catch (err) {
    console.error(err, "Error fetching user stats");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
