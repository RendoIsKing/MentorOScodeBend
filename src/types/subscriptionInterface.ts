import { SubscriptionStatusEnum } from "./enums/SubscriptionStatusEnum";
import { SubscriptionPlanInterface } from "./SubscriptionPlanInterface";

export interface SubscriptionInterface {
  _id?: string;
  id?: string;
  userId: string;
  StripeSubscriptionId: string;
  StripePriceId: string;
  planId: string | SubscriptionPlanInterface;
  status: SubscriptionStatusEnum;
  stripeSubscriptionObject: string;
  startDate: Date;
  endDate: Date;
}
