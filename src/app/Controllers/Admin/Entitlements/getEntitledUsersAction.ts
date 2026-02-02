import { Request, Response } from "express";
import { User } from "../../../Models/User";

export const getEntitledUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const perPage = Math.max(parseInt(String(req.query.perPage || "10"), 10), 1);
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const skip = (page - 1) * perPage;

    const match = {
      isDeleted: false,
      $or: [{ isMentor: true }, { isVerified: true }],
    };

    const [total, users] = await Promise.all([
      User.countDocuments(match),
      User.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .select("fullName userName email isMentor isVerified isActive photoId createdAt")
        .lean(),
    ]);

    return res.json({
      data: users,
      meta: {
        perPage,
        page,
        pages: Math.ceil(total / perPage),
        total,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
