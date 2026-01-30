import { Request, Response } from "express";
import { Document } from "../../../Models/Document";
import { User } from "../../../Models/User";
import { DocumentStatusEnum } from "../../../../types/DocumentStatusEnum";

export const rejectDocument = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const document = await Document.findById(id);
  if (!document) {
    return res.status(400).json({ error: { message: "No Document found" } });
  }

  try {
    const data = await Document.findByIdAndUpdate(
      id,
      {
        verifiedBy: null,
        verifiedAt: null,
        status: DocumentStatusEnum.Rejected,
      },
      { new: true }
    );

    const user = await User.findById(data?.userId);
    if (user) {
      await User.findByIdAndUpdate(user.id, {
        isVerified: false,
        hasDocumentVerified: false,
        isMentor: false,
        verifiedAt: null,
        verifiedBy: null,
      });
    }

    return res.json({ data, message: "Document rejected successfully." });
  } catch (err) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
