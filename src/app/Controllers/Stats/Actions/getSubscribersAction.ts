import { Request, Response } from "express";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { Subscription } from "../../../Models/Subscription";
import { Types } from "mongoose";

export const getSubscribers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const plans = await SubscriptionPlan.find({
      userId: id,
      isDeleted: false,
    }).select("_id");
    const plansId = plans.map((plan) => plan.id);

    const subscibers = await Subscription.aggregate([
      {
        $match: {
          planId: { $in: plansId.map((id) => new Types.ObjectId(id)) },
          status: "active",
        },
      },
      {
        $project: {
          userId: 1,
        },
      },
      {
        $group: {
          _id: "$userId",
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$doc" },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "users",
        },
      },
      {
        $addFields: {
          users: {
            $cond: {
              if: { $gt: [{ $size: "$users" }, 0] },
              then: { $arrayElemAt: ["$users", 0] },
              else: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: "files",
          foreignField: "_id",
          localField: "users.photoId",
          as: "photoId",
        },
      },
      {
        $addFields: {
          photoId: {
            $cond: {
              if: { $gt: [{ $size: "$photoId" }, 0] },
              then: { $arrayElemAt: ["$photoId", 0] },
              else: null,
            },
          },
        },
      },
      {
        $project: {
          userId: 1,
          fullName: "$users.fullName",
          userName: "$users.userName",
          photoId: "$photoId.path",
        },
      },
    ]);

    return res.status(200).json({ data: subscibers });
  } catch (error) {
    console.error("Error while fetching susbcribers", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
