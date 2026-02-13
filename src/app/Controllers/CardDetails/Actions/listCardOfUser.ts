import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, Tables } from "../../../../lib/db";

export const listAllCardsOfUser = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    if (!user) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    const { data: cards, error } = await db
      .from(Tables.CARD_DETAILS)
      .select("id, brand, is_default, last4, exp_month, exp_year")
      .eq("user_id", user.id)
      .eq("is_deleted", false);

    if (error) {
      console.error(error, "Error in listing cards of user");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    return res.json({ data: cards || [] });
  } catch (error) {
    console.error(error, "Error in listing cards of user");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
