import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { RolesEnum } from "../../../../types/RolesEnum";
import { findById, deleteById, softDelete, Tables } from "../../../../lib/db";

export const deleteNotification = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const { id } = req.params;

    const notification = await findById(Tables.NOTIFICATIONS, id);

    if (!notification) {
      return res.status(404).json({ error: "Notification not found." });
    }

    if (notification.sent_to != user.id && user.role !== RolesEnum.ADMIN) {
      return res
        .status(403)
        .json({ error: "You are not authorized to delete this notification." });
    }

    if (user.role === RolesEnum.ADMIN) {
      await deleteById(Tables.NOTIFICATIONS, id);
    } else {
      await softDelete(Tables.NOTIFICATIONS, id);
    }
    return res.json({
      message: "Notification deleted successfully.",
    });
  } catch (err) {
    console.error(err, "Error while deleting notification");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
