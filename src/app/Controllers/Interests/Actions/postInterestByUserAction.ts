import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { findById, findMany, updateById, db, Tables } from "../../../../lib/db";

export const postInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { interestIds } = req.body;

    if (!Array.isArray(interestIds) || interestIds.length === 0) {
      return res.status(400).json({ error: { message: "Invalid interest IDs." } });
    }

    const user = req.user as UserInterface;
    const userId = user.id || '';

    const interests = await findMany(Tables.INTERESTS, {
      is_deleted: false,
    }, { select: "id" });

    const validIds = new Set(interests.map((i: any) => i.id));
    const allValid = interestIds.every((id: string) => validIds.has(id));
    if (!allValid) {
      return res.status(404).json({ error: { message: "One or more interests not found." } });
    }

    // Delete existing user_interests for this user, then re-insert
    await db.from(Tables.USER_INTERESTS).delete().eq("user_id", userId);

    const rows = [...new Set(interestIds)].map((interestId: string) => ({
      user_id: userId,
      interest_id: interestId,
    }));

    await db.from(Tables.USER_INTERESTS).insert(rows);

    await updateById(Tables.USERS, userId, {
      has_selected_interest: true,
    });

    const userDoc = await findById(Tables.USERS, userId);

    return res.json({
      data: userDoc,
      message: "Interests added successfully.",
    });
  } catch (err) {
    console.error(err, "Error in posting interest");
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
