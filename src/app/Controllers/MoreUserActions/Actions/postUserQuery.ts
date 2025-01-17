import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { MoreAction } from "../../../Models/MoreAction";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";

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

    const moreAction = new MoreAction({
      actionByUser: user.id,
      query: query,
      actionType: userActionType.USER_QUERY,
    });

    await moreAction.save();
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
