import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { DocumentStatusEnum } from "../../../../types/DocumentStatusEnum";
import { findById, updateById, Tables } from "../../../../lib/db";

export const verifyDocument = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const adminUser = req.user as UserInterface;
  const document = await findById(Tables.DOCUMENTS, id);
  if (!document) {
    return res.status(400).json({ error: { message: "No Document found" } });
  }

  try {
    const data = await updateById(Tables.DOCUMENTS, id, {
      verified_by: adminUser.id,
      verified_at: new Date().toISOString(),
      status: DocumentStatusEnum.Approved,
    });

    if (data?.user_id) {
      await updateById(Tables.USERS, data.user_id, {
        verified_by: adminUser.id,
        verified_at: new Date().toISOString(),
        has_document_verified: true,
        is_mentor: true,
      });
    }

    return res.json({ data: data, message: "User verified successfully." });
  } catch (err) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
