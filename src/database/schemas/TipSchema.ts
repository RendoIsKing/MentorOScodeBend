import { Schema, Types } from "mongoose";

const TipsSchema = new Schema(
  {
    message: {
      type: String,
      required: false,
    },
    tipTo: {
      type: Types.ObjectId,
      ref: "User",
    },
    tipBy: {
      type: Types.ObjectId,
      ref: "User",
    },
    tipOn: {
      type: Types.ObjectId,
      ref: "Post",
    },
  },
  { timestamps: true }
);

export { TipsSchema };
