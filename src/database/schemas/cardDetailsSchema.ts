import { Schema } from "mongoose";

const CardDetailsSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stripeCardId: {
      type: String,
      required: true,
    },
    object: {
      type: String,
      required: true,
    },
    address_city: {
      type: String,
      default: null,
    },
    paymentMethodId: {
      type: String,
      default: null,
    },
    address_country: {
      type: String,
      required: true,
    },
    brand: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    cvc_check: {
      type: String,
      default: null,
    },
    dynamic_last4: {
      type: String,
      default: null,
    },
    exp_month: {
      type: Number,
      required: true,
    },
    exp_year: {
      type: Number,
      required: true,
    },
    fingerprint: {
      type: String,
      required: true,
    },
    funding: {
      type: String,
      required: true,
    },
    last4: {
      type: String,
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    tokenization_method: {
      type: String,
      default: null,
    },
    wallet: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    activatedAt: {
      type: Date,
      default: Date.now,
    },
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

export { CardDetailsSchema };
