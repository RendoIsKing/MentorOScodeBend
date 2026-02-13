import createSlug from "../../../../utils/regx/createSlug";
import stripeInstance from "../../../../utils/stripe";
import { findOne, updateById, Tables } from "../../../../lib/db";

export class EntitlementInput {
  feature: string;
  description: string;

  constructor(feature: string, description: string) {
    this.feature = feature;
    this.description = description;
  }
}

export const RegisterFeatureOnStripe = async (
  entitlements: EntitlementInput[]
): Promise<{ existingFeatureId: string; stripeFeatureId: string }[]> => {
  try {
    const createFeaturePromises = entitlements.map(async (entitlement) => {
      const featureSlug = createSlug(entitlement.feature);

      const existingFeature = await findOne(Tables.FEATURES, {
        feature: entitlement.feature,
      });

      if (!existingFeature) {
        throw new Error(`Feature "${entitlement.feature}" doesnt exists.`);
      }

      if (existingFeature.stripe_feature_id) {
        return {
          existingFeatureId: existingFeature.id,
          stripeFeatureId: existingFeature.stripe_feature_id,
        };
      }

      const stripeFeature = await stripeInstance.entitlements.features.create({
        name: entitlement.feature,
        lookup_key: featureSlug,
      });

      await updateById(Tables.FEATURES, existingFeature.id, {
        stripe_feature_id: stripeFeature.id,
        stripe_feature_object: stripeFeature,
      });

      return {
        existingFeatureId: existingFeature.id,
        stripeFeatureId: stripeFeature.id,
      };
    });

    const featureIds = await Promise.all(createFeaturePromises);
    return featureIds;
  } catch (error) {
    console.log("Error in creating entitlements", error);
    throw error;
  }
};
