import { FeatureInterface } from "./FeatureInterface";
import { SubscriptionPlanType } from "./enums/subscriptionPlanEnum";

export interface SubscriptionPlanInterface {
  _id?: string;
  id?: string;
  title: string;
  description: string;
  planType: SubscriptionPlanType;
  stripeProductId: string;
  stripeProductObject: {} | any;
  featureIds: FeatureInterface;
  stripeProductFeatureIds: [];
  price: number;
  userId: string;
  duration: number;
  isDeleted: boolean;
  deletedAt: Date;
  permissions: [];
}
