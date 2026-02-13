import { Request, Response } from "express";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import { db, Tables } from "../../../../lib/db";

export const getUserQueries = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { data: queries, error } = await db
      .from(Tables.MORE_ACTIONS)
      .select(
        "*, action_by:users!action_by_user(id, user_name), action_to:users!action_to_user(id, user_name)"
      )
      .in("action_type", [userActionType.USER_QUERY, userActionType.REPORT]);

    if (error) {
      console.error(error, "Error while fetching user queries");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    const customQueries = (queries || []).map((query: any) => ({
      ...query,
      action_to: query.action_to || {},
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
