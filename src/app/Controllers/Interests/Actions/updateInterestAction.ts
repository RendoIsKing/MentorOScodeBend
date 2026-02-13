import { Request, Response } from "express";
import { validate } from "class-validator";
import { UpdateInterestInput } from "../Inputs/updateInterestInput";
import { findById, updateById, Tables } from "../../../../lib/db";

export const updateInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const interest = await findById(Tables.INTERESTS, id);
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
    const updated = await updateById(Tables.INTERESTS, id, {
      is_available: req.body.isAvailable,
    });

    return res.json({
      data: updated,
      message: "Interest updated successfully.",
    });
  } catch (err) {
    console.error(err, "Error in updating interest");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
