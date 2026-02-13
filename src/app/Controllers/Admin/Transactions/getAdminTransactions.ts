import { Request, Response } from "express";
import { db, Tables } from "../../../../lib/db";

export const getAdminTransactions = async (
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
      .from(Tables.TRANSACTIONS)
      .select("id", { count: "exact", head: true });

    const { data: transactions, error } = await db
      .from(Tables.TRANSACTIONS)
      .select(
        "*, user:users!user_id(full_name, user_name, email, photo_id)"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    return res.json({
      data: transactions || [],
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
