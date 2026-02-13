import { Request, Response } from "express";
import { DocumentStatusEnum } from "../../../../types/DocumentStatusEnum";
import { findById, updateById, Tables } from "../../../../lib/db";

export const rejectDocument = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const document = await findById(Tables.DOCUMENTS, id);
  if (!document) {
    return res.status(400).json({ error: { message: "No Document found" } });
  }

  try {
    const data = await updateById(Tables.DOCUMENTS, id, {
      verified_by: null,
      verified_at: null,
      status: DocumentStatusEnum.Rejected,
    });

    if (data?.user_id) {
      await updateById(Tables.USERS, data.user_id, {
        is_verified: false,
        has_document_verified: false,
        is_mentor: false,
        verified_at: null,
        verified_by: null,
      });
    }

    return res.json({ data, message: "Document rejected successfully." });
  } catch (err) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
