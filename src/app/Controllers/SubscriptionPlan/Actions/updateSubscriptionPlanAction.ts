import { Request, Response } from "express";
import { validate } from "class-validator";
import { plainToClass } from "class-transformer";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlanInput } from "../Inputs/subscriptionPlanInput";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";
import { findById, findOne, updateById, insertOne, Tables, toSnakeCase } from "../../../../lib/db";

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

    const subscriptionPlan = await findById(Tables.SUBSCRIPTION_PLANS, planId);

    if (!subscriptionPlan) {
      return res
        .status(404)
        .json({ error: { message: "Subscription plan not found." } });
    }

    if (subscriptionPlan.user_id !== user.id) {
      return res
        .status(403)
        .json({
          error: {
            message:
              "You do not have permission to update this subscription plan.",
          },
        });
    }

    let updatedPlan;

    if (subscriptionPlanInput.planType === SubscriptionPlanType.FIXED) {
      const existingFixed = await findOne(Tables.SUBSCRIPTION_PLANS, {
        user_id: user.id,
        plan_type: SubscriptionPlanType.FIXED,
        is_deleted: false,
      });

      if (existingFixed) {
        updatedPlan = await updateById(
          Tables.SUBSCRIPTION_PLANS,
          subscriptionPlan.id,
          toSnakeCase(subscriptionPlanInput)
        );
      } else {
        updatedPlan = await insertOne(Tables.SUBSCRIPTION_PLANS, {
          ...toSnakeCase(subscriptionPlanInput),
          user_id: user.id,
        });
      }

      return res.json({
        data: updatedPlan,
        message: "Fixed Plan updated successfully.",
      });
    }

    updatedPlan = await updateById(
      Tables.SUBSCRIPTION_PLANS,
      subscriptionPlan.id,
      toSnakeCase(subscriptionPlanInput)
    );

    return res.json({
      data: updatedPlan,
      message: "Plan updated successfully.",
    });
  } catch (err) {
    console.error(err, "Error while updating plan");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
