import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { plainToClass } from "class-transformer";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { GetAllItemsInputs } from "../../Posts/Inputs/getPost.input";
import { db, Tables } from "../../../../lib/db";

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
    const pageNum = (page as number) > 0 ? (page as number) : 1;
    const limit = perPage as number;
    const offset = (pageNum - 1) * limit;

    // Get total count
    const { count: total } = await db
      .from(Tables.NOTIFICATIONS)
      .select("id", { count: "exact", head: true })
      .contains("sent_to", [user.id]);

    // Get notifications with related data
    const { data: notifications, error } = await db
      .from(Tables.NOTIFICATIONS)
      .select("*, from_user:users!notification_from_user(id, user_name)")
      .contains("sent_to", [user.id])
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(error, "Error while retrieving notifications");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    return res.json({
      data: notifications || [],
      meta: {
        perPage: limit,
        page: pageNum,
        pages: Math.ceil((total || 0) / limit),
        total: total || 0,
      },
    });
  } catch (err) {
    console.error(err, "Error while retrieving notifications");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
