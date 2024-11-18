import { IsString } from "class-validator";

export class LoginInput {
  @IsString({ message: "email is required." })
  email: string;

  @IsString({ message: "password is required." })
  password: string;
}
