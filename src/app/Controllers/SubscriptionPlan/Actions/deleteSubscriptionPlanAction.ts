import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";
import { findById, count, softDelete, Tables } from "../../../../lib/db";

export const softDeleteSubscriptionPlan = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const planId = req.params.id;

    const subscriptionPlan = await findById(Tables.SUBSCRIPTION_PLANS, planId);
    if (!subscriptionPlan) {
      return res
        .status(404)
        .json({ error: { message: "Subscription plan not found." } });
    }

    if (subscriptionPlan.user_id !== user.id) {
      return res.status(403).json({
        error: {
          message:
            "You do not have permission to delete this subscription plan.",
        },
      });
    }

    const activeCount = await count(Tables.SUBSCRIPTIONS, {
      plan_id: planId,
      status: SubscriptionStatusEnum.ACTIVE,
    });

    if (activeCount > 0) {
      return res.status(400).json({
        error: { message: "Cannot delete plan with active subscribers." },
      });
    }

    await softDelete(Tables.SUBSCRIPTION_PLANS, planId);

    return res.json({
      data: { ...subscriptionPlan, is_deleted: true },
      message: "Plan deleted successfully.",
    });
  } catch (err) {
    console.error(err, "Error while deleting plan");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
