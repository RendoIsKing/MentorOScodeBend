import { IsString,  IsOptional } from "class-validator";

export class UserLoginDto {

  @IsString({ message: "dial code must in string in string form" })
  @IsOptional()
  dialCode: string;

  @IsString()
  @IsOptional()
  phoneNumber: string;

  //awa hamo add aretam
  @IsString()
  @IsOptional()
  email: string;

  @IsOptional()
  @IsString()
  password: string;

  
}
