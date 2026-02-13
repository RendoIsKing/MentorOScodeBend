import { userActionType } from "../enums/userActionTypeEnum";
import { UserInterface } from "../UserInterface";
import { ReasonEnum } from "../enums/reportReasonEnum";
import { ReportStatusEnum } from "../enums/reportingStatusEnum";

export interface MoreActionInterface {
  _id?: string;
  id?: string;
  actionByUser: string | UserInterface;
  actionToUser: string | UserInterface;
  actionOnPost: string | UserInterface;
  actionType: userActionType;
  reason: ReasonEnum;
  reportStatus: ReportStatusEnum;
  query: string;
}
