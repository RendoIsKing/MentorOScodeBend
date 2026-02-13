import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import { insertOne, Tables } from "../../../../lib/db";

export const postUserQuery = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;

    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: { message: "Query is required" } });
    }

    const moreAction = await insertOne(Tables.MORE_ACTIONS, {
      action_by_user: user.id,
      query: query,
      action_type: userActionType.USER_QUERY,
    });

    return res.json({
      data: moreAction,
      message: "Query added successfully.",
    });
  } catch (err) {
    console.error(err, "Error while posting query");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
