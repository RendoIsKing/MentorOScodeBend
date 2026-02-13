import { Request, Response } from "express";
import { plainToClass } from "class-transformer";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { GetAllItemsInputs } from "../../Posts/Inputs/getPost.input";
import { paginate, Tables } from "../../../../lib/db";

export const getAllFeaturesActions = async (req: Request, res: Response) => {
  try {
    const postQuery: any = plainToClass(GetAllItemsInputs, req.query);
    const errors = await validate(postQuery);
    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res
        .status(400)
        .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
    }

    const { perPage, page } = postQuery;

    const result = await paginate(Tables.FEATURES, {}, {
      page: page as number,
      pageSize: perPage as number,
      orderBy: "created_at",
      ascending: false,
    });

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
    console.log("error in getting all features", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
