import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";

export const getEntitledUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const perPage = Math.max(
      parseInt(String(req.query.perPage || "10"), 10),
      1
    );
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const offset = (page - 1) * perPage;

    const { count: total } = await db
      .from(Tables.USERS)
      .select("id", { count: "exact", head: true })
      .eq("is_deleted", false)
      .or("is_mentor.eq.true,is_verified.eq.true");

    const { data: users, error } = await db
      .from(Tables.USERS)
      .select(
        "full_name, user_name, email, is_mentor, is_verified, is_active, photo_id, created_at"
      )
      .eq("is_deleted", false)
      .or("is_mentor.eq.true,is_verified.eq.true")
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    return res.json({
      data: users || [],
      meta: {
        perPage,
        page,
        pages: Math.ceil((total || 0) / perPage),
        total: total || 0,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
