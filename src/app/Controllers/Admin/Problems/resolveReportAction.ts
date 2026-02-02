import { Request, Response } from "express";
import { MoreAction } from "../../../Models/MoreAction";
import { ReportStatusEnum } from "../../../../types/enums/reportingStatusEnum";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";

export const resolveReport = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const updated = await MoreAction.findOneAndUpdate(
      { _id: id, actionType: userActionType.REPORT },
      { reportStatus: ReportStatusEnum.APPROVED },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: { message: "Report not found." } });
    }

    return res.json({ data: updated, message: "Report resolved." });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
