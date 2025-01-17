import { Type } from "class-transformer";

import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { PostStatusEnum } from "../../../../types/enums/postStatuseEnum";
import { Privacy } from "../../../../types/enums/privacyEnums";
import { MediaDto, UserTagDto } from "./createPost.input";
import { PostType } from "../../../../types/enums/postTypeEnum";

export class UpdatePostDto {
  @IsString()
  @IsOptional()
  content: string;

  @IsOptional()
  @IsString()
  planToAccess: string;

  @IsOptional()
  @IsBoolean()
  isPinned: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MediaDto)
  media: MediaDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsOptional()
  @IsEnum(Privacy)
  privacy: Privacy;

  @ValidateNested({ each: true })
  @Type(() => UserTagDto)
  @IsOptional()
  userTags: UserTagDto[];

  @IsOptional()
  @IsNumber()
  price: string;

  @IsOptional()
  @IsEnum(PostStatusEnum)
  status: PostStatusEnum;

  @IsOptional()
  @IsEnum(PostType)
  type: PostType;
}
