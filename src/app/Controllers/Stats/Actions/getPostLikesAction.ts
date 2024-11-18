import { Request, Response } from "express";
import { Interaction } from "../../../Models/Interaction";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";

export const getPostLikes = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const likes = await Interaction.find({
      post: id,
      type: InteractionType.LIKE_POST,
      isDeleted: false,
    }).populate("user");

    return res.status(200).json({ data: likes });
  } catch (error) {
    console.error("Error fetching likes on post", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
