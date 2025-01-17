import { Request, Response } from "express";
import { stripe_currency } from "../../../../utils/consts/stripeCurrency";
import stripeInstance from "../../../../utils/stripe";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { plainToClass } from "class-transformer";
import { validate } from "class-validator";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlanInput } from "../Inputs/subscriptionPlanInput";
import { RegisterFeatureOnStripe } from "../../Features/Actions/registerFeatureOnStripeAction";
import {
  ProductFeature,
  associateFeatureToProduct,
} from "../../Features/Actions/associateFeatureToProduct";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";
import { Types } from "mongoose";

export const createProduct = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const body = req.body;

    const user = req.user as UserInterface;
    const subscriptionPlanInput = plainToClass(SubscriptionPlanInput, req.body);
    const validationErrors = await validate(subscriptionPlanInput);

    if (validationErrors.length > 0) {
      return res.status(400).json({ errors: validationErrors });
    }

    if (subscriptionPlanInput.planType === SubscriptionPlanType.FIXED) {
      const plan = await SubscriptionPlan.findOne({
        userId: new Types.ObjectId(user.id),
        planType: SubscriptionPlanType.FIXED,
        isDeleted: false,
      });
      if (plan) {
        return res.status(422).json({
          error: {
            message:
              "You already have a fixed plan, pls delete it and then create a new one...... ",
          },
        });
      }
    }

    const stripeProduct = await stripeInstance.products.create({
      name: body.title,
      description: body.description,
      metadata: {},
      default_price_data: {
        currency: stripe_currency,
        recurring: {
          interval: "month", // @future should be dynamic from api, @todo if not dynamic move to constants
        },
        unit_amount: body.price,
        // name: body.name,
      },
    });

    let productFeatures: ProductFeature[] = [];
    let updatedProduct;

    const product = await SubscriptionPlan.create({
      ...subscriptionPlanInput,
      userId: user.id,
      stripeProductId: stripeProduct.id,
      stripeProductObject: stripeProduct,
    });

    if (subscriptionPlanInput.entitlements) {
      const featureIds = await RegisterFeatureOnStripe(
        subscriptionPlanInput.entitlements
      );

      const existingFeatureIds = featureIds.map((fi) => fi.existingFeatureId);
      const stripeFeatureIds = featureIds.map((fi) => fi.stripeFeatureId);

      const featureAssociationParams = {
        productId: stripeProduct.id,
        featureIds: subscriptionPlanInput.entitlements.map(
          (entitlement) => entitlement.feature
        ),
      };
      productFeatures = await associateFeatureToProduct(
        featureAssociationParams
      );
      updatedProduct = await SubscriptionPlan.findByIdAndUpdate(
        product.id,
        {
          $addToSet: {
            featureIds: { $each: existingFeatureIds },
            stripeProductFeatureIds: { $each: stripeFeatureIds },
            stripeProductFeatureId: {
              $each: productFeatures.map((pf) => pf.stripeProductFeatureId),
            },
          },
        },

        { new: true }
      );
    }

    return res.json({ data: updatedProduct });
  } catch (error) {
    console.log(error, "error creating product");
    return res.status(500).json({
      messsage: "Something went wrong",
      error: error,
    });
  }
};

export default createProduct;
