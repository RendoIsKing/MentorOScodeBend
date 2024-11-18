import { Request, Response } from "express";
import { userConnection } from "../../../Models/Connection";
import { Types } from "mongoose";

export const getFollowers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const followers = await userConnection.aggregate([
      { $match: { followingTo: new Types.ObjectId(id) } },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "ownerDetails",
        },
      },
      { $unwind: "$ownerDetails" },
      {
        $lookup: {
          from: "files",
          localField: "ownerDetails.photoId",
          foreignField: "_id",
          as: "ownerDetails.photo",
        },
      },
      {
        $unwind: {
          path: "$ownerDetails.photo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "followingTo",
          foreignField: "_id",
          as: "followingToDetails",
        },
      },
      { $unwind: "$followingToDetails" },
      {
        $lookup: {
          from: "files",
          localField: "followingToDetails.photoId",
          foreignField: "_id",
          as: "followingToDetails.photo",
        },
      },
      {
        $unwind: {
          path: "$followingToDetails.photo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "userconnections",
          let: { ownerId: "$ownerDetails._id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$owner", new Types.ObjectId(id)] },
                    { $eq: ["$followingTo", "$$ownerId"] },
                  ],
                },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: "isFollowingBack",
        },
      },
      {
        $addFields: {
          isFollowingBack: {
            $cond: {
              if: { $gt: [{ $size: "$isFollowingBack" }, 0] },
              then: true,
              else: false,
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          owner: "$ownerDetails",
          followingTo: "$followingToDetails",
          createdAt: 1,
          updatedAt: 1,
          isFollowingBack: 1,
        },
      },
    ]);

    return res.status(200).json({ data: followers });
  } catch (error) {
    console.error("Error while fetching followers", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
