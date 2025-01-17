import { Document, Types } from "mongoose";
import { userActionType } from "../enums/userActionTypeEnum";
import { UserInterface } from "../UserInterface";
import { ReasonEnum } from "../enums/reportReasonEnum";
import { ReportStatusEnum } from "../enums/reportingStatusEnum";

export interface MoreActionInterface extends Document {
  actionByUser: Types.ObjectId | UserInterface;
  actionToUser: Types.ObjectId | UserInterface;
  actionOnPost: Types.ObjectId | UserInterface;
  actionType: userActionType;
  reason: ReasonEnum;
  reportStatus: ReportStatusEnum;
  query: string;
}
