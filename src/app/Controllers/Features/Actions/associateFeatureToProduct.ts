import stripeInstance from "../../../../utils/stripe";
import { findOne, findMany, Tables } from "../../../../lib/db";

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

    const product = await findOne(Tables.SUBSCRIPTION_PLANS, {
      stripe_product_id: productId,
    });
    if (!product) {
      throw new Error("Product not found");
    }

    // Find features by slug (featureIds here are slug values)
    const features = await findMany(Tables.FEATURES, {}, {
      select: "*",
    });

    // Filter to only matching slugs
    const matchedFeatures = (features || []).filter((f: any) =>
      featureIds.includes(f.slug)
    );

    const productFeatures = await Promise.all(
      matchedFeatures.map(async (feature: any) => {
        const productFeature = await stripeInstance.products.createFeature(
          product.stripe_product_id,
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

    return productFeatures;
  } catch (error) {
    console.log("error in associating product to feature", error);
    return error;
  }
};
