import { Document } from "mongoose";

export interface FeatureInterface extends Document {
  feature: string;
  slug: string;
  description: string;
  isAvailable: boolean;
  stripeFeatureId: string;
  stripeFeatureObject: object;
  isDeleted: boolean;
  deletedAt: Date;
}
