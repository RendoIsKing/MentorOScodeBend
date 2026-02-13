import { IsString } from "class-validator";

export class CreateCategoryInput {
  @IsString({ message: "title is required." })
  // @ts-ignore
  title: string;

  @IsString({ message: "moduleId is required." })
  // @ts-ignore
  moduleId: string;

}
