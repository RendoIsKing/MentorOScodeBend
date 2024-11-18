import { Request, Response } from "express";
import { validate } from "class-validator";
import { UserInterface } from "../../../../types/UserInterface";
import { InterestInput } from "../Inputs/postInterestInput";
import crypto from "crypto";
import { Interest } from "../../../Models/Interest";

const generateRandomSlug = (length: number = 8): string => {
  return crypto.randomBytes(length).toString("hex");
};

export const createInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const validationErrors = await validate(req.body as InterestInput);
    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    const addedBy = req.user as UserInterface;
    const slug = generateRandomSlug();

    const existingInterest = await Interest.findOne({
      title: req.body.title,
      isDeleted: false,
    });
    if (existingInterest) {
      return res
        .status(400)
        .json({
          error: {
            message:
              "This interest has already been added by you or some other admin.",
          },
        });
    }

    const newInterest = new Interest({
      ...req.body,
      addedBy: addedBy.id,
      slug: slug,
    });

    await newInterest.save();

    return res.json({
      data: newInterest,
      message: "Interest added successfully.",
    });
  } catch (err) {
    console.error(err, "Error in creating a interest");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
