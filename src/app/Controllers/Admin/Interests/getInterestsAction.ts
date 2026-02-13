import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";

export const getInterests = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    // Get all interests with usage counts via user_interests join table
    const { data: interests, error } = await db
      .from(Tables.INTERESTS)
      .select("id, title, slug")
      .eq("is_deleted", false);

    if (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    // Get usage counts from user_interests
    const results = await Promise.all(
      (interests || []).map(async (interest: any) => {
        const { count: usageCount } = await db
          .from(Tables.USER_INTERESTS)
          .select("id", { count: "exact", head: true })
          .eq("interest_id", interest.id);

        return {
          interestId: interest.id,
          title: interest.title,
          slug: interest.slug,
          usageCount: usageCount || 0,
        };
      })
    );

    // Sort by usage count desc, then title asc
    results.sort((a, b) => b.usageCount - a.usageCount || a.title.localeCompare(b.title));

    return res.json({ data: results });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
