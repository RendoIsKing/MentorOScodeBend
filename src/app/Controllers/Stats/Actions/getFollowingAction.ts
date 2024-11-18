import { Request, Response } from "express";
import { userConnection } from "../../../Models/Connection";

export const getFollowing = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const following = await userConnection
      .find({ owner: id })
      .populate({
        path: "owner",
        populate: {
          path: "photo",
          model: "File",
        },
      })
      .populate({
        path: "followingTo",
        populate: {
          path: "photo",
          model: "File",
        },
      });

    return res.status(200).json({ data: following });
  } catch (error) {
    console.error("Error while fetching following", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
