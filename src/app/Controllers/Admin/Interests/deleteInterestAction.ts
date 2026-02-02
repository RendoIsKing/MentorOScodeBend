import { Request, Response } from "express";
import { Interest } from "../../../Models/Interest";
import { User } from "../../../Models/User";

export const deleteInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { tagName } = req.body;
    if (!tagName) {
      return res.status(400).json({ error: { message: "tagName is required." } });
    }

    const regex = new RegExp(`^${String(tagName).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, "i");
    const interest = await Interest.findOne({
      isDeleted: false,
      $or: [{ title: regex }, { slug: regex }],
    });

    if (!interest) {
      return res.status(404).json({ error: { message: "Interest not found." } });
    }

    await User.updateMany(
      { interests: interest._id },
      { $pull: { interests: interest._id } }
    );

    interest.isDeleted = true;
    interest.isAvailable = false;
    interest.deletedAt = new Date();
    await interest.save();

    return res.json({ message: "Interest deleted successfully." });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
