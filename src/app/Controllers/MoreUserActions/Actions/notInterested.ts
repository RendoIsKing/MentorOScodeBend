import { Request, Response } from "express";
import { validate } from "class-validator";
import { UserInterface } from "../../../../types/UserInterface";
import { MoreActionInput } from "../Inputs/moreActionInput";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import { ReportStatusEnum } from "../../../../types/enums/reportingStatusEnum";
import { findOne, insertOne, Tables } from "../../../../lib/db";
import { PostType } from "../../../../types/enums/postTypeEnum";

export const notInterested = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;

    const validationErrors = await validate(req.body as MoreActionInput);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    let moreAction;

    if (req.body.actionType === userActionType.NOT_INTERESTED) {
      const post = await findOne(Tables.POSTS, {
        id: req.body.actionOnPost,
        type: PostType.POST,
        is_deleted: false,
      });

      if (!post) {
        return res.status(404).json({ error: { message: "Post not found" } });
      }

      moreAction = await insertOne(Tables.MORE_ACTIONS, {
        action_by_user: user.id,
        action_on_post: req.body.actionOnPost,
        action_type: userActionType.NOT_INTERESTED,
      });
    } else {
      const userToReport = await findOne(Tables.USERS, {
        id: req.body.actionToUser,
        is_deleted: false,
      });

      if (!userToReport) {
        return res.status(404).json({ error: { message: "User not found" } });
      }
      moreAction = await insertOne(Tables.MORE_ACTIONS, {
        action_by_user: user.id,
        action_to_user: userToReport.id,
        action_type: userActionType.REPORT,
        reason: req.body.reason,
        report_status: ReportStatusEnum.PENDING,
      });
    }

    return res.json({
      data: moreAction,
      message: "Action added successfully.",
    });
  } catch (err) {
    console.error(err, "Error while marking the post not Interested");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
