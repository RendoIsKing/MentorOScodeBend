import { Request, Response } from "express";
import mongoose from "mongoose";
import { Post } from "../../../Models/Post";
import { UserInterface } from "../../../../types/UserInterface";

export const getTaggedUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const user = req.user as UserInterface;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }

    const post = await Post.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
          deletedAt: null,
          isDeleted: false,
        },
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
              $lookup: {
                from: "userconnections",
                let: { userId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          {
                            $eq: [
                              "$owner",
                              new mongoose.Types.ObjectId(user._id),
                            ],
                          },
                          { $eq: ["$followingTo", "$$userId"] },
                        ],
                      },
                    },
                  },
                ],
                as: "isFollowing",
              },
            },
            {
              $addFields: {
                isFollowing: { $gt: [{ $size: "$isFollowing" }, 0] },
              },
            },
            {
              $lookup: {
                from: "files",
                localField: "photoId",
                foreignField: "_id",
                as: "photo",
              },
            },
            {
              $unwind: {
                path: "$photo",
                preserveNullAndEmptyArrays: true,
              },
            },

            {
              $project: {
                _id: 1,
                fullName: 1,
                userName: 1,
                photoId: 1,
                isFollowing: 1,
                "photo.path": 1,
              },
            },
          ],
          as: "taggedUsers",
        },
      },
      {
        $project: {
          taggedUsers: 1,
        },
      },
    ]);

    if (post.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    return res.json(post[0]);
  } catch (error) {
    console.error("Error retrieving tagged users:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
