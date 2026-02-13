import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";

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

    const { data: updatedDocument, error } = await db
      .from(Tables.MORE_ACTIONS)
      .update({ report_status: reportStatus })
      .eq("id", id)
      .eq("action_type", userActionType.REPORT)
      .select()
      .single();

    if (error || !updatedDocument) {
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
