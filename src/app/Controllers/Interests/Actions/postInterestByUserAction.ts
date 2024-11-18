import { Request, Response } from "express";
import { User } from "../../../Models/User";
import { Interest } from "../../../Models/Interest";
import { UserInterface } from "../../../../types/UserInterface";
import { Types } from "mongoose";

export const postInterest = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { interestIds } = req.body;

    if (!Array.isArray(interestIds) || interestIds.some(id => !Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: { message: "Invalid interest IDs." } });
    }

    const user = req.user as UserInterface;
    const userId = user.id;

    const interests = await Interest.find({ _id: { $in: interestIds }, isDeleted: false });
    if (interests.length !== interestIds.length) {
      return res.status(404).json({ error: { message: "One or more interests not found." } });
    }

    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    userDoc.interests = [...new Set([...userDoc.interests, ...interestIds])];
    userDoc.hasSelectedInterest = true;

    await userDoc.save();

    return res.json({
      data: userDoc,
      message: "Interests added successfully.",
    });
  } catch (err) {
    console.error(err, "Error in posting interest");
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
