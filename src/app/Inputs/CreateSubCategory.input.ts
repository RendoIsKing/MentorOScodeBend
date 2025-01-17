import { IsString } from "class-validator";
import { Types } from "mongoose";

export class CreateSubCategoryInput {
  @IsString({ message: "title is required." })
  // @ts-ignore
  title: string;

  @IsString({ message: "categoryId is required." })
  // @ts-ignore
  categoryId: Types.ObjectId;
}
