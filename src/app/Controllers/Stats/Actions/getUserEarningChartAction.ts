import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { Transaction } from "../../../Models/Transaction";
import { Types } from "mongoose";
import { ProductType } from "../../../../types/enums/productEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import getDatesInRange from "../../../../utils/getDatesBetRange";

export const getUserEarningChart = async (
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
        $addFields: {
          customDate: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
        },
      },
      {
        $facet: {
          subscription: [
            {
              $match: {
                productType: ProductType.SUBSCRIPTION,
              },
            },
            {
              $group: {
                _id: "$customDate",
                count: {
                  $sum: "$amount",
                },
              },
            },
          ],
          tips: [
            {
              $match: {
                productType: ProductType.TIPS,
              },
            },
            {
              $group: {
                _id: "$customDate",
                count: {
                  $sum: "$amount",
                },
              },
            },
          ],
          posts: [
            {
              $match: {
                productType: ProductType.POSTS,
              },
            },
            {
              $group: {
                _id: "$customDate",
                count: {
                  $sum: "$amount",
                },
              },
            },
          ],
        },
      },
    ]);

    const dateRange = getDatesInRange(startDate, endDate);
    let dateSet: Set<any> = new Set(dateRange);

    Object.entries(transaction[0]).forEach((item) => {
      const date = (item as any)[1].map((sub: any) => sub._id);
      date.map((date: any) => dateSet.add(date));
    });

    let dateSetArray = [...dateSet];

    const statsData = Object.entries(transaction[0]).map((item) => {
      return {
        label: item[0],
        data: dateSetArray.map((date: any) => {
          const exist = (item as any)[1].find((subs: any) => subs._id == date);
          if (exist) {
            return exist.count / 100;
          } else {
            return 0;
          }
        }),
        paymentMethod: "Card",
      };
    });

    // const { id } = req.params;

    // let formattedDates = dateSetArray.map((date) => dateFormatter(date));

    return res.status(200).json({
      data: {
        labels: dateSetArray,
        datasets: statsData,
      },
      //   dateSetArray,
      //   dateSet,
      //   transaction,
    });
  } catch (error) {
    console.error("Error while fetching user earnings", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
