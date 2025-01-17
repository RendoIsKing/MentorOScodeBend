import { IsNotEmpty, IsString, Matches } from "class-validator";

export class UserForgotPasswordDto {
  @IsNotEmpty()
  @IsString()
  // @Matches(/^\d{1,4}$/, { message: "Dial code must be in the format +XXX" })
  dialCode?: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+$/, { message: "Phone number must contain only digits" })
  phoneNumber?: string;
}
