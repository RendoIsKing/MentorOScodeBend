import { Schema, Types } from "mongoose";

const InterestSchema = new Schema(
  {
    title: {
      type: String,
      required: false,
    },
    slug: {
      type: String,
      required: false,
    },
    addedBy: {
      type: Types.ObjectId,
      ref: "User",
    },
    isAvailable: {
      type: Boolean,
      default: true,
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

export { InterestSchema };
// import { Schema } from "mongoose";

// const InterestSchema = new Schema(
//   {
//     title: {
//       type: String,
//       required: true,
//     },
//     isDeleted: {
//       type: Boolean,
//       default: false,
//     },
//     deletedAt: {
//       type: Date,
//       default: null,
//     },
//   },
//   { timestamps: true }
// );

// export { InterestSchema };
