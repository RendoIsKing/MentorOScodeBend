import { Request, Response } from "express";
import { stripe_currency } from "../../../../utils/consts/stripeCurrency";
import stripeInstance from "../../../../utils/stripe";
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
import { findOne, insertOne, updateById, Tables, toSnakeCase } from "../../../../lib/db";

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
      const plan = await findOne(Tables.SUBSCRIPTION_PLANS, {
        user_id: user.id,
        plan_type: SubscriptionPlanType.FIXED,
        is_deleted: false,
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
          interval: "month",
        },
        unit_amount: body.price,
      },
    });

    let productFeatures: ProductFeature[] = [];

    const product = await insertOne(Tables.SUBSCRIPTION_PLANS, {
      ...toSnakeCase(subscriptionPlanInput),
      user_id: user.id,
      stripe_product_id: stripeProduct.id,
      stripe_product_object: stripeProduct,
    });

    let updatedProduct = product;

    if (subscriptionPlanInput.entitlements && product) {
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

      updatedProduct = await updateById(Tables.SUBSCRIPTION_PLANS, product.id, {
        feature_ids: [
          ...(product.feature_ids || []),
          ...existingFeatureIds,
        ],
        stripe_product_feature_ids: [
          ...(product.stripe_product_feature_ids || []),
          ...stripeFeatureIds,
        ],
        stripe_product_feature_id: [
          ...(product.stripe_product_feature_id || []),
          ...productFeatures.map((pf) => pf.stripeProductFeatureId),
        ],
      });
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
