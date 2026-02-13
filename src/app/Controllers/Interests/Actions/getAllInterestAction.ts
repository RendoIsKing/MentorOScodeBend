import { Request, Response } from "express";
import { paginate, Tables } from "../../../../lib/db";

export const getAllInterest = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
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
      Tables.INTERESTS,
      { is_deleted: false },
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
  } catch (err) {
    console.log(err, "Error in getting all interest");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
