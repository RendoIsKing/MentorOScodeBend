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
export { UserConnectionSchema };

