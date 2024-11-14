import { Request, Response } from "express";
import { validate } from "class-validator";
import { UserInterface } from "../../../../types/UserInterface";
import { Post } from "../../../Models/Post";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { MoreAction } from "../../../Models/MoreAction";
import { MoreActionInput } from "../Inputs/moreActionInput";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import { User } from "../../../Models/User";
import mongoose from "mongoose";
import { ReportStatusEnum } from "../../../../types/enums/reportingStatusEnum";

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
      const post = Post.findOne({
        _id: new mongoose.Types.ObjectId(req.body.actionOnPost),
        type: PostType.POST,
        isDeleted: false,
        deletedAt: null,
      });

      if (!post) {
        return res.status(404).json({ error: { message: "Post not found" } });
      }

      moreAction = new MoreAction({
        actionByUser: user.id,
        actionOnPost: req.body.actionOnPost,
        actionType: userActionType.NOT_INTERESTED,
      });

      await moreAction.save();
    } else {
      const userToReport = await User.findOne({
        _id: new mongoose.Types.ObjectId(req.body.actionToUser),
        isDeleted: false,
        deletedAt: null,
      });

      if (!userToReport) {
        return res.status(404).json({ error: { message: "Post not found" } });
      }
      moreAction = new MoreAction({
        actionByUser: user.id,
        actionToUser: userToReport.id,
        actionType: userActionType.REPORT,
        reason: req.body.reason,
        rreportStatus: ReportStatusEnum.PENDING,
      });

      await moreAction.save();
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
