import { Document, Types } from "mongoose";
import { SubscriptionStatusEnum } from "./enums/SubscriptionStatusEnum";
import { SubscriptionPlanInterface } from "./SubscriptionPlanInterface";

export interface SubscriptionInterface extends Document {
  userId: Types.ObjectId;
  StripeSubscriptionId: string;
  StripePriceId: string;
  planId: Types.ObjectId | SubscriptionPlanInterface;
  status: SubscriptionStatusEnum;
  stripeSubscriptionObject: string;
  startDate: Date;
  endDate: Date;
}
