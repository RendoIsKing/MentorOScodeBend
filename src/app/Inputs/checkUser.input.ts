import { IsString } from "class-validator";

export class CheckUserInput {
  @IsString({ message: "phone number is required." })
  // @ts-ignore
  phoneNumber: string;

  @IsString({ message: "dialCode is required." })
  // @ts-ignore
  dialCode: string;

  @IsString({ message: "email is required." })
  // @ts-ignore
  email: string;

  @IsString({ message: "country is required." })
  // @ts-ignore
  country: string;
}
