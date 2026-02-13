import { Request, Response } from "express";
import createSlug from "../../../../utils/regx/createSlug";
import { findOne, insertOne, Tables } from "../../../../lib/db";

export const createFeature = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const body = req.body;
    const featureSlug = createSlug(body.feature);

    const featureExist = await findOne(Tables.FEATURES, { slug: featureSlug });
    if (featureExist) {
      return res.status(400).json({
        message: "Feature already existed with this name",
      });
    }

    const feature = await insertOne(Tables.FEATURES, {
      ...body,
      slug: featureSlug,
      is_available: true,
    });
    return res.json({
      data: feature,
    });
  } catch (error) {
    console.log("error in creating feature", error);
    return res.status(500).json({
      messsage: "Something went wrong",
      error: error,
    });
  }
};
