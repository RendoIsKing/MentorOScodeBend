import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { paginate, Tables } from "../../../../lib/db";

export const getOwnTransactions = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = _req.user as UserInterface;

    const LIMIT = 10;

    const perPage =
      _req.query &&
      _req.query.perPage &&
      parseInt(_req.query.perPage as string) > 0
        ? parseInt(_req.query.perPage as string)
        : LIMIT;

    const page =
      _req.query && _req.query.page && parseInt(_req.query.page as string) > 0
        ? parseInt(_req.query.page as string)
        : 1;

    const result = await paginate(
      Tables.TRANSACTIONS,
      { user_id: user.id },
      {
        orderBy: "created_at",
        ascending: false,
        page,
        pageSize: perPage,
      }
    );

    return res.json({
      data: result.data,
      meta: {
        perPage: result.pageSize,
        page: result.page,
        pages: Math.ceil(result.total / result.pageSize),
        total: result.total,
      },
    });
  } catch (error) {
    console.error("Error retrieving Transactions of the user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
