import { Request, Response } from "express";
import { Types } from "mongoose";
import { UserInterface } from "../../../../types/UserInterface";
import { Transaction } from "../../../Models/Transaction";

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
    let skip = (page - 1) * perPage;

    const [query] = await Transaction.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(user.id),
        },
      },
      {
        $facet: {
          results: [
            { $skip: skip },
            { $limit: perPage },
            { $sort: { createdAt: -1 } },
          ],
          transactionCount: [{ $count: "count" }],
        },
      },
    ]);

    const transactionCount = query.transactionCount[0]?.count || 0;
    const totalPages = Math.ceil(transactionCount / perPage);

    return res.json({
      data: query.results,
      meta: {
        perPage: perPage,
        page: _req.query.page || 1,
        pages: totalPages,
        total: transactionCount,
      },
    });
    // if (!transactions) {
    //   return res.status(404).json({ error: "No Transactions found" });
    // }

    // return res.json({
    //   data: transactions,
    // });
  } catch (error) {
    console.error("Error retrieving Transactions of the user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
