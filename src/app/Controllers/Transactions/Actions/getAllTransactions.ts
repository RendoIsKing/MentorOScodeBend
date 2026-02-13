import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { GetAllItemsInputs } from "../../Posts/Inputs/getPost.input";
import { db, Tables } from "../../../../lib/db";

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
    const pageNum = (page as number) > 0 ? (page as number) : 1;
    const limit = perPage as number;
    const offset = (pageNum - 1) * limit;

    // Get total count
    const { count: total } = await db
      .from(Tables.TRANSACTIONS)
      .select("id", { count: "exact", head: true });

    // Get transactions with user info
    const { data: transactions, error } = await db
      .from(Tables.TRANSACTIONS)
      .select("*, user:users!user_id(id, user_name)")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.log("Error while fetching all transactions", error);
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    return res.json({
      data: transactions || [],
      meta: {
        perPage: limit,
        page: pageNum,
        pages: Math.ceil((total || 0) / limit),
        total: total || 0,
      },
    });
  } catch (err) {
    console.log("Error while fetching all transactions", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
