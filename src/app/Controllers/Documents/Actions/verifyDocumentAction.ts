import { Request, Response } from "express";
import { Document } from "../../../Models/Document";
import { User } from "../../../Models/User";
import { UserInterface } from "../../../../types/UserInterface";
import { DocumentStatusEnum } from "../../../../types/DocumentStatusEnum";

export const verifyDocument = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const adminUser = req.user as UserInterface;
  const document = await Document.findById(id);
  if (!document) {
    return res.status(400).json({ error: { message: "No Document found" } });
  }

  try {
    const data = await Document.findByIdAndUpdate(id, {
      verifiedBy: id,
      verifiedAt: new Date(),
      status: DocumentStatusEnum.Approved,
    },
  {
    new: true,
  });

    const user = await User.findById(data?.userId);
    if (user) {
      await User.findByIdAndUpdate(user.id, {
        verifiedBy: adminUser.id,
        verifiedAt: new Date(),
        hasDocumentVerified: true
      });
    }

    return res.json({ data: data, message: "User verified successfully." });
  } catch (err) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
