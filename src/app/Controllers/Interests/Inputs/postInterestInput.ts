import { IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Types } from 'mongoose';

export class InterestInput {

  @IsOptional()
  @IsString({ message: 'Title should be a string.' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Slug should be a string.' })
  slug?: string;

  @IsNotEmpty({ message: 'Added by (userId) is required.' })
  addedBy: Types.ObjectId;

  @IsOptional()
  @IsBoolean({ message: 'isAvailable should be a boolean.' })
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isDeleted should be a boolean.' })
  isDeleted?: boolean;

  @IsOptional()
  @IsString({ message: 'Deleted at should be a valid date string.' })
  deletedAt?: Date;
}
