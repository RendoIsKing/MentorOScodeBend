import createSlug from "../../../../utils/regx/createSlug";
import stripeInstance from "../../../../utils/stripe";
import { Feature } from "../../../Models/Feature";

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

      const existingFeature = await Feature.findOne({
        feature: entitlement.feature,
      });

      if (!existingFeature) {
        throw new Error(`Feature "${entitlement.feature}" doesnt exists.`);
      }

      if (existingFeature.stripeFeatureId) {
        return {
          existingFeatureId: existingFeature.id,
          stripeFeatureId: existingFeature.stripeFeatureId,
        };
      }

      const stripeFeature = await stripeInstance.entitlements.features.create({
        name: entitlement.feature,
        lookup_key: featureSlug,
      });

      existingFeature.stripeFeatureId = stripeFeature.id;
      existingFeature.stripeFeatureObject = stripeFeature;
      await existingFeature.save();

      // return stripeFeature.id;
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
