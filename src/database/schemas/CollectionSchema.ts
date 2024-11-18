import { Schema, Types } from "mongoose";
import { ICollection } from "../../types/interfaces/CollectionInterface";

const CollectionSchema: Schema<ICollection> = new Schema(
  {
    title: String,
    owner: {
      type: Types.ObjectId,
      ref: "User",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
  }
);

export { CollectionSchema };
