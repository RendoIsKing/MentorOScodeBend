import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { Interaction } from "../../../Models/Interaction";
import { Post } from "../../../Models/Post";
import { Subscription } from "../../../Models/Subscription";
import { Transaction } from "../../../Models/Transaction";
import { User } from "../../../Models/User";
import { UserData } from "../../../Models/UserData";
import { FileFormatEnum } from "../../../../types/enums/fileFormatEnum";
export const processUserData = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const requestedUserId = user._id;

    const { fileFormat } = req.body;

    if (!fileFormat) {
      return res
        .status(400)
        .json({ error: { message: "File format is required" } });
    }

    if (!Object.values(FileFormatEnum).includes(fileFormat)) {
      return res
        .status(400)
        .json({ error: { message: "Invalid file format" } });
    }

    const existingDatasets = await UserData.find({
      user: requestedUserId,
      fileFormat,
      isExpired: false,
    });

    if (existingDatasets.length > 1) {
      await UserData.updateMany(
        { user: requestedUserId, fileFormat, isExpired: false },
        { $set: { isExpired: true } }
      );
    }

    const userInfo = await User.findById(
      requestedUserId,
      "username photoId bio email completePhoneNumber"
    ).lean();

    const posts = await Post.find({ user: requestedUserId }).lean();

    const interactions = await Interaction.find({
      interactedBy: requestedUserId,
    }).lean();

    const transactions = await Transaction.find({
      userId: requestedUserId,
    }).lean();

    const subscriptions = await Subscription.find({
      userId: requestedUserId,
    }).lean();

    const aggregatedData = {
      userInfo,
      posts,
      interactions,
      transactions,
      subscriptions,
    };

    const userData = new UserData({
      user: requestedUserId,
      data: aggregatedData,
      fileFormat,
      downloadBefore: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await userData.save();

    return res.json({ userData });
  } catch (error) {
    console.log("Error while processing user data", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
