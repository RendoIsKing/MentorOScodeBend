import { Request, Response } from "express";
import { MoreAction } from "../../../Models/MoreAction";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";

export const getUserQueries = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const queries = await MoreAction.find({
      actionType: {
        $in: [userActionType.USER_QUERY, userActionType.REPORT],
      },
    })
      .populate({
        path: "actionByUser",
        select: "userName",
      })
      .populate({
        path: "actionToUser",
        select: "userName",
      })
      .exec();

    const customQueries = queries.map((query) => ({
      ...query.toObject(),
      actionToUser: query.actionToUser || {},
    }));

    return res.status(200).json({
      data: customQueries,
      message: "User queries fetched successfully.",
    });
  } catch (err) {
    console.error(err, "Error while fetching user queries");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
