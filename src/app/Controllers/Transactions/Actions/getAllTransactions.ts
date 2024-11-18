import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { commonPaginationPipeline } from "../../../../utils/pipeline/commonPagination";
import { Transaction } from "../../../Models/Transaction";
import { GetAllItemsInputs } from "../../Posts/Inputs/getPost.input";

export const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

export const getAllTransactions = async (req: Request, res: Response) => {
  try {
    const transQuery: any = plainToClass(GetAllItemsInputs, req.query);
    const errors = await validate(transQuery);
    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res
        .status(400)
        .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
    }

    const { perPage, page } = transQuery;

    let skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    const transactions = await Transaction.aggregate([
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          amount: 1,
          stripePaymentIntentId: 1,
          stripeProductId: 1,
          productId: 1,
          status: 1,
          type: 1,
          createdAt: 1,
          updatedAt: 1,
          userInfo: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$userInfo",
                  as: "user",
                  in: {
                    _id: "$$user._id",
                    userName: "$$user.userName",
                  },
                },
              },
              0, // Get the first element of the array
            ],
          },
        },
      },
      ...commonPaginationPipeline(page as number, perPage as number, skip),
    ]);
    let data = {
      data: transactions[0]?.data ?? [],
      meta: transactions[0]?.metaData?.[0] ?? {},
    };

    return res.json(data);
  } catch (err) {
    console.log("Error while fetching all transactions", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
