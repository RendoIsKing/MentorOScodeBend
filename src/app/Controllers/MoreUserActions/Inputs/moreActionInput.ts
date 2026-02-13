import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { userActionType } from "../../../../types/enums/userActionTypeEnum";
import { ReasonEnum } from "../../../../types/enums/reportReasonEnum";

export class MoreActionInput {
  @IsOptional()
  @IsString()
  actionToUser: string;

  @IsOptional()
  @IsString()
  actionOnPost: string;

  @IsNotEmpty({ message: "actionType is required." })
  @IsEnum(userActionType)
  actionType: userActionType;

  @IsOptional()
  @IsEnum(ReasonEnum, { message: "Invalid reason" })
  reason?: ReasonEnum;
}
