import { IsString } from "class-validator";
import { Types } from "mongoose";

export class CreateCategoryInput {
  @IsString({ message: "title is required." })
  // @ts-ignore
  title: string;

  @IsString({ message: "moduleId is required." })
  // @ts-ignore
  moduleId: Types.ObjectId;

}
