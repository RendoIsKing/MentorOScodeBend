import { Type } from "class-transformer";
import {
  IsOptional,
  IsString,
  IsNumber,
  ArrayMinSize,
  ValidateNested,
  IsEnum,
  IsNotEmpty,
} from "class-validator";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";

class EntitlementInput {
  @IsString({ message: "Feature should be a string." })
  feature: string;

  @IsString({ message: "description should be a string." })
  description: string;
}

export class SubscriptionPlanInput {
  @IsOptional()
  @IsString({ message: "Title should be a string." })
  title?: string;

  @IsOptional()
  @IsString({ message: "Description should be a string." })
  description?: string;

  @IsOptional()
  @IsNumber({}, { message: "Price should be a number." })
  price?: number;

  @IsOptional()
  @IsNumber({}, { message: "Duration should be a number." })
  duration?: number;

  @IsOptional()
  @IsEnum(SubscriptionPlanType, {
    message: "Plan type must be either FIXED or CUSTOM.",
  })
  planType?: SubscriptionPlanType;

  @IsNotEmpty()
  @ValidateNested({ each: true })
  @ArrayMinSize(1, { message: "There should be at least one entitlement." })
  @Type(() => EntitlementInput)
  entitlements?: EntitlementInput[];
}
