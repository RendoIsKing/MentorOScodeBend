import { Request, Response } from "express";
import { User } from "../../../Models/User";

export const grantEntitlement = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ error: { message: "email and role are required." } });
    }

    const user = await User.findOne({ email: String(email).toLowerCase(), isDeleted: false });
    if (!user) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    const roleValue = String(role).toLowerCase();
    if (roleValue === "mentor") {
      user.isMentor = true;
      user.hasDocumentVerified = true;
      user.isVerified = true;
      user.verifiedAt = new Date();
    } else if (roleValue === "verified") {
      user.isVerified = true;
      user.verifiedAt = new Date();
    } else {
      return res.status(400).json({ error: { message: "Invalid role." } });
    }

    await user.save();

    return res.json({ data: user, message: "Entitlement granted." });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
