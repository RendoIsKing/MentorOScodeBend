import { Request, Response } from "express";
import { ReportStatusEnum } from "../../../../types/enums/reportingStatusEnum";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import { db, Tables } from "../../../../lib/db";

export const resolveReport = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const { data: updated, error } = await db
      .from(Tables.MORE_ACTIONS)
      .update({ report_status: ReportStatusEnum.APPROVED })
      .eq("id", id)
      .eq("action_type", userActionType.REPORT)
      .select()
      .single();

    if (error || !updated) {
      return res
        .status(404)
        .json({ error: { message: "Report not found." } });
    }

    return res.json({ data: updated, message: "Report resolved." });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
