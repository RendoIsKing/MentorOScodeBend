import { Request, Response } from "express";
import { User } from "../../../Models/User";

export const getInterests = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    const results = await User.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: "$interests" },
      {
        $group: {
          _id: "$interests",
          usageCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "interests",
          localField: "_id",
          foreignField: "_id",
          as: "interest",
        },
      },
      { $unwind: "$interest" },
      { $match: { "interest.isDeleted": { $ne: true } } },
      {
        $project: {
          _id: 0,
          interestId: "$_id",
          title: "$interest.title",
          slug: "$interest.slug",
          usageCount: 1,
        },
      },
      { $sort: { usageCount: -1, title: 1 } },
    ]);

    return res.json({ data: results });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
