import { Request, Response } from "express";
import { Feature } from "../../../Models/Feature";
import createSlug from "../../../../utils/regx/createSlug";

export const createFeature = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const body = req.body;
    const featureSlug = createSlug(body.feature);

    const featureExist = await Feature.findOne({ slug: featureSlug });
    if (featureExist) {
      return res.status(400).json({
        message: "Feature already existed with this name",
      });
    }

    const feature = await Feature.create({
      ...body,
      slug: featureSlug,
      isAvailable: true,
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
