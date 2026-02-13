import { Request, Response } from "express";
import { findMany, Tables } from "../../../../lib/db";
import { UserInterface } from "../../../../types/UserInterface";

export const getUserData = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const user = req.user as UserInterface;
    const requestedUserId = (user as any).id || user._id;

    const userDatasets: any[] = await findMany(Tables.USER_DATA, {
      user_id: requestedUserId,
      is_expired: false,
    });

    if (!userDatasets || userDatasets.length === 0) {
      return res
        .status(404)
        .json({ error: { message: "User data not found" } });
    }

    const userDataJson =
      userDatasets.find((dataset: any) => dataset.file_format === "json") ||
      null;
    const userDataText =
      userDatasets.find((dataset: any) => dataset.file_format === "text") ||
      null;

    const response = {
      userDataJson: userDataJson
        ? {
            _id: userDataJson.id,
            user: userDataJson.user_id,
            ...userDataJson.data,
            fileFormat: userDataJson.file_format,
            downloadBefore: userDataJson.download_before,
            isExpired: userDataJson.is_expired,
            requested_date: userDataJson.created_at,
          }
        : null,
      userDataText: userDataText
        ? {
            _id: userDataText.id,
            user: userDataText.user_id,
            ...userDataText.data,
            fileFormat: userDataText.file_format,
            downloadBefore: userDataText.download_before,
            isExpired: userDataText.is_expired,
            requested_date: userDataText.created_at,
          }
        : null,
    };

    return res.json(response);
  } catch (error) {
    console.log("Error while processing user data", error);
    res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
