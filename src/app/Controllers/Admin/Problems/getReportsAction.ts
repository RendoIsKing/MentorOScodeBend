import { Request, Response } from "express";
import { MoreAction } from "../../../Models/MoreAction";
import { ReportStatusEnum } from "../../../../types/enums/reportingStatusEnum";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";

export const getReports = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const perPage = Math.max(parseInt(String(req.query.perPage || "10"), 10), 1);
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const skip = (page - 1) * perPage;

    const match = {
      actionType: userActionType.REPORT,
      reportStatus: ReportStatusEnum.PENDING,
      isDeleted: false,
    };

    const [total, reports] = await Promise.all([
      MoreAction.countDocuments(match),
      MoreAction.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .populate("actionByUser", "fullName userName email photoId")
        .populate("actionToUser", "fullName userName email photoId")
        .populate("actionOnPost")
        .lean(),
    ]);

    return res.json({
      data: reports,
      meta: {
        perPage,
        page,
        pages: Math.ceil(total / perPage),
        total,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
