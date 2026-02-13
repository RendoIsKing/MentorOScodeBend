import { Request, Response } from "express";
import { ReportStatusEnum } from "../../../../types/enums/reportingStatusEnum";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import { db, Tables } from "../../../../lib/db";

export const getReports = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const perPage = Math.max(
      parseInt(String(req.query.perPage || "10"), 10),
      1
    );
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const offset = (page - 1) * perPage;

    const { count: total } = await db
      .from(Tables.MORE_ACTIONS)
      .select("id", { count: "exact", head: true })
      .eq("action_type", userActionType.REPORT)
      .eq("report_status", ReportStatusEnum.PENDING)
      .eq("is_deleted", false);

    const { data: reports, error } = await db
      .from(Tables.MORE_ACTIONS)
      .select(
        "*, reported_by:users!action_by_user(full_name, user_name, email, photo_id), reported_user:users!action_to_user(full_name, user_name, email, photo_id)"
      )
      .eq("action_type", userActionType.REPORT)
      .eq("report_status", ReportStatusEnum.PENDING)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    return res.json({
      data: reports || [],
      meta: {
        perPage,
        page,
        pages: Math.ceil((total || 0) / perPage),
        total: total || 0,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
