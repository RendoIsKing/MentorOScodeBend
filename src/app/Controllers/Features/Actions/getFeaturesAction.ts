import { Request, Response } from "express";
import { Feature } from "../../../Models/Feature";
import { plainToClass } from "class-transformer";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { commonPaginationPipeline } from "../../../../utils/pipeline/commonPagination";
import { GetAllItemsInputs } from "../../Posts/Inputs/getPost.input";

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

    let skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    const features = await Feature.aggregate([
      ...commonPaginationPipeline(page as number, perPage as number, skip),
    ]);
    let data = {
      data: features[0]?.data ?? [],
      meta: features[0]?.metaData?.[0] ?? {},
    };

    return res.json(data);
  } catch (err) {
    console.log("error in getting all features", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
