import { IsEmail, IsOptional, IsString } from "class-validator";

export class RegisterInput {
  @IsString({ message: "Firstname is required." })
  // @ts-ignore
  firstName: string;

  @IsString({ message: "Lastname is required." })
  // @ts-ignore
  lastName: string;

  @IsEmail({}, { message: "Email should be valid." })
  // @ts-ignore
  email: string;

  @IsString({ message: "phone number is required." })
  // @ts-ignore
  phoneNumber: string;

  @IsString({ message: "password is required." })
  // @ts-ignore
  password: string;

  @IsString({ message: "dialCode is required." })
  // @ts-ignore
  dialCode: string;

  @IsString({ message: "country is required." })
  // @ts-ignore
  country: string;

  @IsOptional()
  @IsString({ message: "Full name should be a string." })
  fullName?: string;

  @IsOptional()
  @IsString({ message: "Username should be a string." })
  userName?: string;

  @IsOptional()
  @IsString({ message: "Gender should be a string." })
  gender?: string;
}
