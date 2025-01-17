import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { FirebaseNotificationEnum } from "../../../../types/enums/FirebaseNotificationEnum";

export class CreateNotificationInput {
  @IsNotEmpty({ message: "Title is required." })
  @IsString({ message: "Title should be a string." })
  title: string;

  @IsNotEmpty({ message: "Description is required." })
  @IsString({ message: "Description should be a string." })
  description: string;

  @IsOptional()
  @IsEnum(FirebaseNotificationEnum, {
    message: "Type should be a valid notification type.",
  })
  type?: FirebaseNotificationEnum;
}
