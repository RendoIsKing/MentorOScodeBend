import { Schema, Types } from "mongoose";
import { FileFormatEnum } from "../../types/enums/fileFormatEnum";

const UserDataSchema = new Schema(
  {
    user: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    fileFormat: {
      type: String,
      enum: [FileFormatEnum.JSON, FileFormatEnum.TEXT],
    },
    downloadBefore: {
      type: Date,
      required: true,
    },
    isExpired: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export { UserDataSchema };
