import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { Transaction } from "../../../Models/Transaction";
import { Types } from "mongoose";
import { ProductType } from "../../../../types/enums/productEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";

export const getUserEarningStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const { startDate, endDate } = req.body;

    const transaction = await Transaction.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(user.id),
          createdAt: { $gte: new Date(startDate), $lt: new Date(endDate) },
          type: TransactionType.CREDIT,
        },
      },
      {
        $facet: {
          Subcription: [
            {
              $match: {
                productType: ProductType.SUBSCRIPTION,
              },
            },
            {
              $group: {
                _id: null,
                count: {
                  $sum: "$amount",
                },
              },
            },
          ],
          Tips: [
            {
              $match: {
                productType: ProductType.TIPS,
              },
            },
            {
              $group: {
                _id: null,
                count: {
                  $sum: "$amount",
                },
              },
            },
          ],
          Posts: [
            {
              $match: {
                productType: ProductType.POSTS,
              },
            },
            {
              $group: {
                _id: null,
                count: {
                  $sum: "$amount",
                },
              },
            },
          ],
        },
      },
    ]);

    const data = Object.entries(transaction[0]).map((item) => {
      return {
        invoice: item[0],
        gross: (item as any)[1][0]?.count,
        netAmt: (item as any)[1][0]?.count,
        paymentMethod: "Card",
      };
    });

    return res.status(200).json({ data: data });
  } catch (error) {
    console.error("Error fetching user earning stats", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
