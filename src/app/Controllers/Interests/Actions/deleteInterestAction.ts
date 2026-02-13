import { Request, Response } from "express";
import { findById, softDelete, Tables } from "../../../../lib/db";

export const deleteInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const interest = await findById(Tables.INTERESTS, id);
    if (!interest) {
      return res
        .status(404)
        .json({ error: { message: "Interest not found." } });
    }

    await softDelete(Tables.INTERESTS, id);

    return res.json({
      data: { ...interest, is_deleted: true },
      message: "Interest deleted successfully.",
    });
  } catch (err) {
    console.error(err, "Error in deleting a interest");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
