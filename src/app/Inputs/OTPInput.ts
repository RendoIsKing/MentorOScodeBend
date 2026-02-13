import { IsString } from "class-validator";

export class OTPInput {
  @IsString({ message: "otp is required" })
  otp: string;

  @IsString({ message: "id is required" })
  id: string;
}
