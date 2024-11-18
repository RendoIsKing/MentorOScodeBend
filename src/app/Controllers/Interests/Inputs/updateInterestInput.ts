import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateInterestInput {
  @IsOptional()
  @IsBoolean({ message: 'isAvailable should be a boolean.' })
  isAvailable?: boolean;
}
