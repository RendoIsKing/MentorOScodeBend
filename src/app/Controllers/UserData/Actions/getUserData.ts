import { Request, Response } from "express";
import { UserData } from "../../../Models/UserData";
import { UserInterface } from "../../../../types/UserInterface";

export const getUserData = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const user = req.user as UserInterface;
    const requestedUserId = user._id;

    const userDatasets: any = await UserData.find({
      user: requestedUserId,
      isExpired: false,
    }).lean();

    if (!userDatasets || userDatasets.length === 0) {
      return res
        .status(404)
        .json({ error: { message: "User data not found" } });
    }

    const userDataJson =
      userDatasets.find((dataset: any) => dataset.fileFormat === "json") ||
      null;
    const userDataText =
      userDatasets.find((dataset: any) => dataset.fileFormat === "text") ||
      null;

    const response = {
      userDataJson: userDataJson
        ? {
            _id: userDataJson._id,
            user: userDataJson.user,
            ...userDataJson.data,
            fileFormat: userDataJson.fileFormat,
            downloadBefore: userDataJson.downloadBefore,
            isExpired: userDataText?.isExpired,
            requested_date: userDataJson.createdAt,
            __v: userDataJson.__v,
          }
        : null,
      userDataText: userDataText
        ? {
            _id: userDataText._id,
            user: userDataText.user,
            ...userDataText.data,
            fileFormat: userDataText.fileFormat,
            downloadBefore: userDataText.downloadBefore,
            isExpired: userDataText?.isExpired,
            requested_date: userDataText.createdAt,

            __v: userDataText.__v,
          }
        : null,
    };

    return res.json(response);
  } catch (error) {
    console.log("Error while processing user data", error);
    res.status(500).json({ error: { message: "Something went wrong" } });
  }
};

// import { Request, Response } from "express";
// import { UserInterface } from "../../../../types/UserInterface";
// import { UserData } from "../../../Models/UserData";

// export const getUserData = async (
//   req: Request,
//   res: Response
// ): Promise<Response> => {
//   const user = req.user as UserInterface;
//   const userId = user.id;

//   try {
//     const userData = await UserData.find({ user: userId, isExpired: false });

//     if (userData) {
//       return res.json({ data: userData });
//     }

//     return res.status(404).json({ error: { message: "userData not found." } });
//   } catch (err) {
//     return res
//       .status(500)
//       .json({ error: { message: "Something went wrong." } });
//   }
// };
