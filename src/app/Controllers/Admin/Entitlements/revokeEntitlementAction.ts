import { Request, Response } from "express";
import { User } from "../../../Models/User";

export const revokeEntitlement = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ error: { message: "role is required." } });
    }

    const user = await User.findById(id);
    if (!user || user.isDeleted) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    const roleValue = String(role).toLowerCase();
    if (roleValue === "mentor") {
      user.isMentor = false;
      user.hasDocumentVerified = false;
    } else if (roleValue === "verified") {
      user.isVerified = false;
      user.verifiedAt = null;
      user.verifiedBy = null;
    } else {
      return res.status(400).json({ error: { message: "Invalid role." } });
    }

    await user.save();

    return res.json({ data: user, message: "Entitlement revoked." });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
