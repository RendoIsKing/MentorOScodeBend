import { Schema, Types } from "mongoose";

import { userActionType } from "../../types/enums/userActionTypeEnum";
import { ReasonEnum } from "../../types/enums/reportReasonEnum";
import { ReportStatusEnum } from "../../types/enums/reportingStatusEnum";

const MoreActionSchema = new Schema(
  {
    actionType: {
      type: String,
      enum: [
        userActionType.NOT_INTERESTED,
        userActionType.REPORT,
        userActionType.USER_QUERY,
      ],
    },

    reportStatus: {
      type: String,
      enum: [
        ReportStatusEnum.APPROVED,
        ReportStatusEnum.CANCEL,
        ReportStatusEnum.PENDING,
      ],
    },

    reason: {
      type: String,
      enum: [
        ReasonEnum.FRAUD,
        ReasonEnum.HATE_OR_HARASSMENT,
        ReasonEnum.INTELLECTUAL_PROPERTY_VIOLATION,
        ReasonEnum.OTHER,
        ReasonEnum.PRETENDING_TO_BE_SOMEONE_ELSE,
        ReasonEnum.REGULATED_GOODS_AND_ACTIVITIES,
        ReasonEnum.SPAM,
        ReasonEnum.VIOLENCE,
      ],
    },

    query: {
      type: String,
    },

    actionByUser: {
      type: Types.ObjectId,
      ref: "User",
    },
    actionToUser: {
      type: Types.ObjectId,
      ref: "User",
    },
    actionOnPost: {
      type: Types.ObjectId,
      ref: "Post",
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

export { MoreActionSchema };
