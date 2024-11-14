import { IsString } from "class-validator";

export class UserLoginDto {
  @IsString({ message: "dial code is required." })
  dialCode: string;

  @IsString()
  phoneNumber: string;
}
