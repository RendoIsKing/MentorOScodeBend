import { Request, Response } from "express";
import { Interest } from "../../../Models/Interest";
import { Types } from "mongoose";

export const deleteInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ error: { message: "Invalid interest ID." } });
    }

    const interest = await Interest.findById(id);
    if (!interest) {
      return res
        .status(404)
        .json({ error: { message: "Interest not found." } });
    }

    interest.isDeleted = true;
    interest.deletedAt = new Date();
    await interest.save();

    return res.json({
      data: interest,
      message: "Interest deleted successfully.",
    });
  } catch (err) {
    console.error(err, "Error in deleting a interest");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
