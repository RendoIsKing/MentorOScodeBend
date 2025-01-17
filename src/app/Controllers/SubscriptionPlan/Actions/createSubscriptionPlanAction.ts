import { Request, Response } from "express";
import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlanInput } from "../Inputs/subscriptionPlanInput";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";

export const postSubscriptionPlan = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;

    const subscriptionPlanInput = plainToClass(SubscriptionPlanInput, req.body);
    const validationErrors = await validate(subscriptionPlanInput);

    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    let subscriptionPlan;

    if (subscriptionPlanInput.planType === SubscriptionPlanType.FIXED) {
      subscriptionPlan = await SubscriptionPlan.findOne({
        userId: user.id,
        planType: SubscriptionPlanType.FIXED,
        isDeleted: false,
      });

      if (subscriptionPlan) {
        subscriptionPlan = await SubscriptionPlan.findByIdAndUpdate(
          subscriptionPlan._id,
          { ...subscriptionPlanInput },
          { new: true }
        );
      } else {
        subscriptionPlan = await SubscriptionPlan.create({
          ...subscriptionPlanInput,
          userId: user.id,
        });
      }
    } else {
      subscriptionPlan = await SubscriptionPlan.create({
        ...subscriptionPlanInput,
        userId: user.id,
      });
    }

    return res.json({
      data: subscriptionPlan,
      message: "Plan created successfully.",
    });
  } catch (err) {
    console.error(err, "Error creating plan");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
