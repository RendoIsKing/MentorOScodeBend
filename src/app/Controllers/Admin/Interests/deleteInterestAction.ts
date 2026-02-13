import { Request, Response } from "express";
import { db, findOne, updateById, Tables } from "../../../../lib/db";

export const deleteInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { tagName } = req.body;
    if (!tagName) {
      return res
        .status(400)
        .json({ error: { message: "tagName is required." } });
    }

    // Find interest by title or slug (case-insensitive)
    const { data: interests } = await db
      .from(Tables.INTERESTS)
      .select("*")
      .eq("is_deleted", false)
      .or(`title.ilike.${tagName},slug.ilike.${tagName}`)
      .limit(1);

    const interest = interests?.[0];

    if (!interest) {
      return res
        .status(404)
        .json({ error: { message: "Interest not found." } });
    }

    // Remove interest from user_interests table
    await db
      .from(Tables.USER_INTERESTS)
      .delete()
      .eq("interest_id", interest.id);

    // Soft-delete the interest
    await updateById(Tables.INTERESTS, interest.id, {
      is_deleted: true,
      is_available: false,
      deleted_at: new Date().toISOString(),
    });

    return res.json({ message: "Interest deleted successfully." });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
