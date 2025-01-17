import { Request, Response } from "express";
import { Notification } from "../../../Models/Notification";
import { UserInterface } from "../../../../types/UserInterface";
import mongoose from "mongoose";
import { RolesEnum } from "../../../../types/RolesEnum";

export const deleteNotification = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid notification ID." });
    }

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({ error: "Notification not found." });
    }

    if (notification.sentTo != user._id && user.role !== RolesEnum.ADMIN) {
      return res
        .status(403)
        .json({ error: "You are not authorized to delete this notification." });
    }

    if (user.role === RolesEnum.ADMIN) {
      await notification.deleteOne();
    } else {
      notification.deletedAt = new Date();
      notification.isDeleted = true;
      await notification.save();
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
