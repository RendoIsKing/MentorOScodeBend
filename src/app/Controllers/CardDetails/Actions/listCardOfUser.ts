import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { cardDetails } from "../../../Models/CardDetails";

export const listAllCardsOfUser = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    if (!user) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    const cards = await cardDetails.aggregate([
      {
        $match: {
          userId: user._id,
          isDeleted: false,
          deletedAt: null,
        },
      },
      {
        $project: {
          _id: 1,
          brand: 1,
          isDefault: 1,
          last4: 1,
          exp_month: 1,
          exp_year: 1,
        },
      },
    ]);

    return res.json({ data: cards });
  } catch (error) {
    console.error(error, "Error in listing cards of user");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
