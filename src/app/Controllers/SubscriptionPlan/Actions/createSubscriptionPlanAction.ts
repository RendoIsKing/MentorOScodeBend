import { Request, Response } from "express";
import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlanInput } from "../Inputs/subscriptionPlanInput";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";
import { findOne, insertOne, updateById, Tables, toSnakeCase } from "../../../../lib/db";

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
      subscriptionPlan = await findOne(Tables.SUBSCRIPTION_PLANS, {
        user_id: user.id,
        plan_type: SubscriptionPlanType.FIXED,
        is_deleted: false,
      });

      if (subscriptionPlan) {
        subscriptionPlan = await updateById(
          Tables.SUBSCRIPTION_PLANS,
          subscriptionPlan.id,
          toSnakeCase(subscriptionPlanInput)
        );
      } else {
        subscriptionPlan = await insertOne(Tables.SUBSCRIPTION_PLANS, {
          ...toSnakeCase(subscriptionPlanInput),
          user_id: user.id,
        });
      }
    } else {
      subscriptionPlan = await insertOne(Tables.SUBSCRIPTION_PLANS, {
        ...toSnakeCase(subscriptionPlanInput),
        user_id: user.id,
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
