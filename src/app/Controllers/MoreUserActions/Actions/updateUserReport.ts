import { Request, Response } from "express";
import { MoreAction } from "../../../Models/MoreAction";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import mongoose from "mongoose";

export const updateUserReport = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const { reportStatus } = req.body;

    if (!reportStatus) {
      return res
        .status(400)
        .json({ error: { message: "Report status is required." } });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: { message: "Invalid ID format." } });
    }

    const updatedDocument = await MoreAction.findOneAndUpdate(
      {
        _id: id,
        actionType: userActionType.REPORT,
      },
      {
        reportStatus: reportStatus,
      },
      {
        new: true,
      }
    );

    if (!updatedDocument) {
      return res
        .status(404)
        .json({ error: { message: "Document not found." } });
    }

    return res.status(200).json({
      data: updatedDocument,
      message: "Report status updated successfully.",
    });
  } catch (err) {
    console.error(err, "Error while updating user report");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
