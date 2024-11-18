import { Request, Response } from "express";
import { Notification } from "../../../Models/Notification";
import { UserInterface } from "../../../../types/UserInterface";
import { plainToClass } from "class-transformer";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { commonPaginationPipeline } from "../../../../utils/pipeline/commonPagination";
import { GetAllItemsInputs } from "../../Posts/Inputs/getPost.input";

export const getNotifications = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const notificationQuery: any = plainToClass(GetAllItemsInputs, req.query);
    const errors = await validate(notificationQuery);
    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res
        .status(400)
        .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
    }

    const { perPage, page } = notificationQuery;

    let skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    const notifications = await Notification.aggregate([
      { $match: { sentTo: user._id } },
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "users",
          localField: "sentTo",
          foreignField: "_id",
          as: "sentToUserDetails",
        },
      },
      {
        $lookup: {
          from: "posts",
          localField: "notificationOnPost",
          foreignField: "_id",
          as: "postDetails",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "notificationFromUser",
          foreignField: "_id",
          as: "notificationFromUserDetails",
        },
      },
      {
        $project: {
          title: 1,
          description: 1,
          sentTo: {
            $map: {
              input: "$sentToUserDetails",
              as: "user",
              in: {
                _id: "$$user._id",
                userName: "$$user.userName",
              },
            },
          },
          notificationOnPost: {
            $arrayElemAt: ["$postDetails._id", 0],
          },
          notificationFromUserDetails: {
            $arrayElemAt: ["$notificationFromUserDetails.userName", 0],
          },
          readAt: 1,
          type: 1,
          isDeleted: 1,
          deletedAt: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },

      ...commonPaginationPipeline(page as number, perPage as number, skip),
    ]);
    let data = {
      data: notifications[0]?.data ?? [],
      meta: notifications[0]?.metaData?.[0] ?? {},
    };
    return res.json(data);
  } catch (err) {
    console.error(err, "Error while retrieving notifications");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
