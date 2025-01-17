import { Request, Response } from "express";
import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlanInput } from "../Inputs/subscriptionPlanInput";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";

export const updateSubscriptionPlan = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const planId = req.params.id;

    const subscriptionPlanInput = plainToClass(SubscriptionPlanInput, req.body);
    const validationErrors = await validate(subscriptionPlanInput, {
      skipMissingProperties: true,
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    const subscriptionPlan = await SubscriptionPlan.findById(planId);

    if (!subscriptionPlan) {
      return res
        .status(404)
        .json({ error: { message: "Subscription plan not found." } });
    }

    if (subscriptionPlan.userId.toString() !== user.id) {
      return res
        .status(403)
        .json({
          error: {
            message:
              "You do not have permission to update this subscription plan.",
          },
        });
    }
    //@ts-ignore
    let subscriptionPlanToUpdate;

    if (subscriptionPlanInput.planType === SubscriptionPlanType.FIXED) {
      subscriptionPlanToUpdate = await SubscriptionPlan.findOne({
        userId: user.id,
        planType: SubscriptionPlanType.FIXED,
        isDeleted: false,
      });

      if (subscriptionPlan) {
        subscriptionPlanToUpdate = await SubscriptionPlan.findByIdAndUpdate(
          subscriptionPlan._id,
          { ...subscriptionPlanInput },
          { new: true }
        );
      } else {
        subscriptionPlanToUpdate = await SubscriptionPlan.create({
          ...subscriptionPlanInput,
          userId: user.id,
        });
      }

      return res.json({
        data: subscriptionPlan,
        message: "Fixed Plan updated successfully.",
      });
    }

    Object.assign(subscriptionPlan, subscriptionPlanInput);

    await subscriptionPlan.save();

    return res.json({
      data: subscriptionPlan,
      message: "Plan updated successfully.",
    });
  } catch (err) {
    console.error(err, "Error while updating plan");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
