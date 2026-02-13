import { Request, Response } from "express";
import { findById, updateById, Tables } from "../../../../lib/db";

export const revokeEntitlement = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!role) {
      return res
        .status(400)
        .json({ error: { message: "role is required." } });
    }

    const user = await findById(Tables.USERS, id);
    if (!user || user.is_deleted) {
      return res
        .status(404)
        .json({ error: { message: "User not found." } });
    }

    const roleValue = String(role).toLowerCase();
    let updates: Record<string, any> = {};

    if (roleValue === "mentor") {
      updates = {
        is_mentor: false,
        has_document_verified: false,
      };
    } else if (roleValue === "verified") {
      updates = {
        is_verified: false,
        verified_at: null,
        verified_by: null,
      };
    } else {
      return res
        .status(400)
        .json({ error: { message: "Invalid role." } });
    }

    const updated = await updateById(Tables.USERS, id, updates);

    return res.json({ data: updated, message: "Entitlement revoked." });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
