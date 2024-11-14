import { Request, Response } from "express";
import { validate } from "class-validator";
import { Interest } from "../../../Models/Interest";
import { UpdateInterestInput } from "../Inputs/updateInterestInput";

export const updateInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const interest = await Interest.findById(id);
  if (!interest) {
    return res.status(400).json({ error: { message: "No Interest found" } });
  }

  const updateInput = new UpdateInterestInput();
  updateInput.isAvailable = req.body.isAvailable;

  const validationErrors = await validate(updateInput);
  if (validationErrors.length > 0) {
    return res.status(400).json({ errors: validationErrors });
  }

  try {
    interest.isAvailable = req.body.isAvailable;

    await interest.save();

    return res.json({
      data: interest,
      message: "Interest updated successfully.",
    });
  } catch (err) {
    console.error(err, "Error in updating interest");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
