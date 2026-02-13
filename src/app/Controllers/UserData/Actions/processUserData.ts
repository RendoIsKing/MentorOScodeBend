import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, Tables, findMany, insertOne } from "../../../../lib/db";
import { FileFormatEnum } from "../../../../types/enums/fileFormatEnum";

export const processUserData = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const requestedUserId = (user as any).id || user._id;

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

    const existingDatasets = await findMany(Tables.USER_DATA, {
      user_id: requestedUserId,
      file_format: fileFormat,
      is_expired: false,
    });

    if (existingDatasets.length > 1) {
      await db
        .from(Tables.USER_DATA)
        .update({ is_expired: true })
        .eq("user_id", requestedUserId)
        .eq("file_format", fileFormat)
        .eq("is_expired", false);
    }

    // Fetch user info (selected fields)
    const { data: userInfo } = await db
      .from(Tables.USERS)
      .select("user_name, photo_id, bio, email, complete_phone_number")
      .eq("id", requestedUserId)
      .single();

    // Fetch posts
    const posts = await findMany(Tables.POSTS, { user_id: requestedUserId });

    // Fetch interactions
    const interactions = await findMany(Tables.INTERACTIONS, {
      interacted_by: requestedUserId,
    });

    // Fetch transactions
    const transactions = await findMany(Tables.TRANSACTIONS, {
      user_id: requestedUserId,
    });

    // Fetch subscriptions
    const subscriptions = await findMany(Tables.SUBSCRIPTIONS, {
      user_id: requestedUserId,
    });

    const aggregatedData = {
      userInfo,
      posts,
      interactions,
      transactions,
      subscriptions,
    };

    const userData = await insertOne(Tables.USER_DATA, {
      user_id: requestedUserId,
      data: aggregatedData,
      file_format: fileFormat,
      download_before: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
    });

    return res.json({ userData });
  } catch (error) {
    console.log("Error while processing user data", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
