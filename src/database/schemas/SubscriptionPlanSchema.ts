import { Schema, Types } from "mongoose";
import { SubscriptionPlanType } from "../../types/enums/subscriptionPlanEnum";
import { FeatureSchema } from "./featureSchema";

// const PermissionSchema = new Schema({
//   feature: { type: String, required: true },
//   isAvailable: { type: Boolean, required: true },
// });

const SubscriptionPlanSchema = new Schema(
  {
    title: {
      type: String,
      required: false,
    },
    description: {
      type: String,
      required: false,
    },
    price: {
      type: Number,
      required: false,
    },
    duration: {
      type: Number,
      required: false,
    },
    stripeProductId: {
      type: String,
      required: false,
    },
    stripeProductFeatureIds: {
      type: [String],
      required: false,
    },
    featureIds: {
      type: [Types.ObjectId],
      // required: false,
      // ref: "Feature",
    },
    stripeProductObject: {
      type: {},
      required: false,
    },
    planType: {
      type: String,
      enum: [
        SubscriptionPlanType.BASIC_FREE,
        SubscriptionPlanType.FIXED,
        SubscriptionPlanType.CUSTOM,
      ],
    },
    userId: {
      type: Types.ObjectId,
      required: true,
      ref: "User",
    },
    permissions: { type: [FeatureSchema], required: false },

    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export { SubscriptionPlanSchema };
