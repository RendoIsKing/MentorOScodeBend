// import { Response } from "express";
import stripeInstance from "../../../../utils/stripe";
import { Feature } from "../../../Models/Feature";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";

interface FeatureCreationParams {
  productId: string;
  featureIds: string[];
}

export interface ProductFeature {
  featureId: string;
  stripeProductFeatureId: string;
}

export const associateFeatureToProduct = async (
  params: FeatureCreationParams
): Promise<ProductFeature[]> => {
  try {
    const { productId, featureIds } = params;

    const product = await SubscriptionPlan.findOne({
      stripeProductId: productId,
    });
    if (!product) {
      throw new Error("Product not found");
      //   return res.status(404).json({
      //     messsage: "Product not found",
      //   });
    }

    const features = await Feature.find({
      slug: { $in: featureIds },
    });

    if (features.length !== featureIds.length) {
      //   throw new Error("One or more features not found");
      //   return res.status(404).json({
      //     messsage: "One or more features not found",
      //   });
    }

    const productFeatures = await Promise.all(
      features.map(async (feature) => {
        const productFeature = await stripeInstance.products.createFeature(
          product.stripeProductId,
          {
            entitlement_feature: feature.slug,
          }
        );

        return {
          featureId: feature.id,
          stripeProductFeatureId: productFeature.id,
        };
      })
    );

    //   const featureIdsArray = productFeatures.map((pf) => pf.featureId.toString());
    return productFeatures;
  } catch (error) {
    console.log("error in associating product to feature", error);
    return error;
  }
};
