import { IsString } from "class-validator";

export class CreateSubCategoryInput {
  @IsString({ message: "title is required." })
  // @ts-ignore
  title: string;

  @IsString({ message: "categoryId is required." })
  // @ts-ignore
  categoryId: string;
}
