import { Request, Response } from "express";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { UserInterface } from "../../../../types/UserInterface";
import mongoose from "mongoose";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";
import { Subscription } from "../../../Models/Subscription";

export const softDeleteSubscriptionPlan = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const planId = req.params.id;

    const subscriptionPlan = await SubscriptionPlan.findById(planId);
    if (!subscriptionPlan) {
      return res
        .status(404)
        .json({ error: { message: "Subscription plan not found." } });
    }

    if (subscriptionPlan.userId.toString() !== user.id) {
      return res.status(403).json({
        error: {
          message:
            "You do not have permission to delete this subscription plan.",
        },
      });
    }

    const activeSubscriptions = await Subscription.aggregate([
      {
        $match: {
          planId: new mongoose.Types.ObjectId(planId),
          status: SubscriptionStatusEnum.ACTIVE,
          endDate: { $gt: new Date() },
        },
      },
      {
        $count: "activeSubscriptionsCount",
      },
    ]);

    if (
      activeSubscriptions.length > 0 &&
      activeSubscriptions[0].activeSubscriptionsCount > 0
    ) {
      return res.status(400).json({
        error: { message: "Cannot delete plan with active subscribers." },
      });
    }

    subscriptionPlan.isDeleted = true;
    subscriptionPlan.deletedAt = new Date();

    await subscriptionPlan.save();

    return res.json({
      data: subscriptionPlan,
      message: "Plan deleted successfully.",
    });
  } catch (err) {
    console.error(err, "Error while deleting plan");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
