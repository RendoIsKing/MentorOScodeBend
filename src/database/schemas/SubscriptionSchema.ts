import { Schema } from "mongoose";
import { SubscriptionInterface } from "../../types/subscriptionInterface";
import { SubscriptionStatusEnum } from "../../types/enums/SubscriptionStatusEnum";

const SubscriptionSchema = new Schema<SubscriptionInterface>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    StripeSubscriptionId: {
      type: String,
      required: true,
    },
    StripePriceId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        SubscriptionStatusEnum.ACTIVE,
        SubscriptionStatusEnum.INACTIVE,
        SubscriptionStatusEnum.PAUSED,
        SubscriptionStatusEnum.CANCEL,
      ],
    },
    startDate: {
      type: Date,
      // required: true,
    },
    endDate: {
      type: Date,
      // required: true,
    },
    stripeSubscriptionObject: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export { SubscriptionSchema };
