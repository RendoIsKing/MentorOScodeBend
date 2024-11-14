import { Schema } from "mongoose";

const FeatureSchema = new Schema(
  {
    feature: {
      type: String,
      required: false,
    },
    slug: {
      type: String,
      required: false,
    },
    isAvailable: {
      type: Boolean,
      required: false,
    },
    description: {
      type: String,
      default: null,
      required: false,
    },
    stripeFeatureId: {
      type: String,
      default: null,
      required: false,
    },
    stripeFeatureObject: {
      type: Object,
      default: null,
      required: false,
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

export { FeatureSchema };
