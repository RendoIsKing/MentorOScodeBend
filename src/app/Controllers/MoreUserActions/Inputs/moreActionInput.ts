import { IsEnum, IsNotEmpty, IsOptional } from "class-validator";
import { Types } from "mongoose";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import { ReasonEnum } from "../../../../types/enums/reportReasonEnum";

export class MoreActionInput {
  @IsOptional()
  actionToUser: Types.ObjectId;

  @IsOptional()
  actionOnPost: Types.ObjectId;

  @IsNotEmpty({ message: "actionType is required." })
  @IsEnum(userActionType)
  actionType: userActionType;

  @IsOptional()
  @IsEnum(ReasonEnum, { message: "Invalid reason" })
  reason?: ReasonEnum;
}
