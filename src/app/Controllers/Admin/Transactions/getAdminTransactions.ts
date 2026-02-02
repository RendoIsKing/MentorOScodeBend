import { Request, Response } from "express";
import { Transaction } from "../../../Models/Transaction";

export const getAdminTransactions = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const perPage = Math.max(parseInt(String(req.query.perPage || "10"), 10), 1);
    const page = Math.max(parseInt(String(req.query.page || "1"), 10), 1);
    const skip = (page - 1) * perPage;

    const [total, transactions] = await Promise.all([
      Transaction.countDocuments({}),
      Transaction.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .populate("userId", "fullName userName email photoId")
        .lean(),
    ]);

    return res.json({
      data: transactions,
      meta: {
        perPage,
        page,
        pages: Math.ceil(total / perPage),
        total,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
