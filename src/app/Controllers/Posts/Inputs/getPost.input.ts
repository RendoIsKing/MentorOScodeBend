import { Transform } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString } from "class-validator";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { PostFilterEnum } from "../../../../types/enums/postsFilterEnum";

export class GetAllItemsInputs {
  @IsOptional()
  @IsString()
  search?: string;

  @Transform(({ value }) => +value)
  @IsOptional()
  @IsNumber()
  perPage?: number;

  @Transform(({ value }) => +value)
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsEnum(PostType)
  type: PostType;

  // @IsOptional()
  // isFollowing: Boolean;

  @IsOptional()
  @IsEnum(PostFilterEnum, {
    message:
      "Invalid filter value. Allowed values are posts, tagged, following, foryou, subscribed, liked, saved, mentors, all",
  })
  filter: PostFilterEnum;

  constructor(page = 1, perPage = 2) {
    this.page = page;
    this.perPage = perPage;
  }
}
