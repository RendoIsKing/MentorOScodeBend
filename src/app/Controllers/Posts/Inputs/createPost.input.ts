import { Type } from "class-transformer";

import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { MediaType } from "../../../../types/enums/mediaTypeEnum";
import { PostStatusEnum } from "../../../../types/enums/postStatuseEnum";
import { Privacy } from "../../../../types/enums/privacyEnums";
import { PostType } from "../../../../types/enums/postTypeEnum";

export class MediaDto {
  @IsString()
  mediaId: string;

  @IsEnum(MediaType)
  mediaType: MediaType;
}

export class LocationDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;
}

export class UserTagDto {
  @ValidateNested()
  @Type(() => LocationDto)
  location: LocationDto;

  @IsString()
  userId: string;

  @IsString()
  userName: string;
}

export class CreatePostDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsNumber()
  price: string;

  @IsOptional()
  @IsString()
  planToAccess: string;

  @IsOptional()
  @IsString()
  orientation: string;

  @ValidateNested({ each: true })
  @Type(() => UserTagDto)
  @IsOptional()
  userTags: UserTagDto[];

  @ValidateNested({ each: true })
  @Type(() => MediaDto)
  media: MediaDto[];

  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsEnum(Privacy)
  privacy: Privacy;

  @IsEnum(PostStatusEnum)
  status: PostStatusEnum;

  @IsEnum(PostType)
  type: PostType;
}
