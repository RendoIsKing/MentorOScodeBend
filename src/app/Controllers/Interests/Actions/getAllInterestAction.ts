import { Request, Response } from "express";
import { Interest } from "../../../Models/Interest";

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
    let skip = (page - 1) * perPage;

    const [query]: any = await Interest.aggregate([
      {
        $match: {
          $or: [{ isDeleted: { $ne: true } }, { deletedAt: null }],
        },
      },

      {
        $facet: {
          results: [
            { $skip: skip },
            { $limit: perPage },
            { $sort: { createdAt: -1 } },
          ],
          interestCount: [{ $count: "count" }],
        },
      },
    ]);

    const interestCount = query.interestCount[0]?.count || 0;
    const totalPages = Math.ceil(interestCount / perPage);

    return res.json({
      data: query.results,
      meta: {
        perPage: perPage,
        page: _req.query.page || 1,
        pages: totalPages,
        total: interestCount,
      },
    });
  } catch (err) {
    console.log(err, "Error in getting all interest");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
