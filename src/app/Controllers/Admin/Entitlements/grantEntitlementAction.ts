import { Request, Response } from "express";
import { findOne, updateById, Tables } from "../../../../lib/db";

export const grantEntitlement = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return res
        .status(400)
        .json({ error: { message: "email and role are required." } });
    }

    const user = await findOne(Tables.USERS, {
      email: String(email).toLowerCase(),
      is_deleted: false,
    });
    if (!user) {
      return res
        .status(404)
        .json({ error: { message: "User not found." } });
    }

    const roleValue = String(role).toLowerCase();
    let updates: Record<string, any> = {};

    if (roleValue === "mentor") {
      updates = {
        is_mentor: true,
        has_document_verified: true,
        is_verified: true,
        verified_at: new Date().toISOString(),
      };
    } else if (roleValue === "verified") {
      updates = {
        is_verified: true,
        verified_at: new Date().toISOString(),
      };
    } else {
      return res
        .status(400)
        .json({ error: { message: "Invalid role." } });
    }

    const updated = await updateById(Tables.USERS, user.id, updates);

    return res.json({ data: updated, message: "Entitlement granted." });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
