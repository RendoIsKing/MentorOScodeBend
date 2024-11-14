import { Schema, Types } from "mongoose";

const UserConnectionSchema = new Schema(
  {
    owner: {
      type: Types.ObjectId,
      ref: "User",
      //   required: true
    },
    followingTo: {
      type: Types.ObjectId,
      ref: "User",
      //   required: true,
    },
  },
  {
    timestamps: true,
  }
);

// UserConnectionSchema.index({ owner: 1, followingTo: 1 }, { unique: true });

export { UserConnectionSchema };
