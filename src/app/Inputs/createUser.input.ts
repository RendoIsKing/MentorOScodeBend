import {
  IsArray,
  // IsDate,
  // IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class Location {
  @IsNumber({}, { message: "Latitude must be a number." })
  @IsNotEmpty({ message: "Latitude is required." })
  @Type(() => Number)
  lat: number;

  @IsNumber({}, { message: "Longitude must be a number." })
  @IsNotEmpty({ message: "Longitude is required." })
  @Type(() => Number)
  long: number;
}

export class UserInput {
  @IsOptional()
  @IsString({ message: "Full name should be a string." })
  fullName?: string;

  @IsOptional()
  @IsString({ message: "Username should be a string." })
  userName?: string;

  @IsOptional()
  @IsString({ message: "Instagram link should be a string." })
  instagramLink?: string;

  @IsOptional()
  @IsString({ message: "Facebook link should be a string." })
  facebookLink?: string;

  @IsOptional()
  @IsString({ message: "TikTok link should be a string." })
  tiktokLink?: string;

  @IsOptional()
  @IsString({ message: "password should be string" })
  password?: string;

  @IsOptional()
  @IsString({ message: "YouTube link should be a string." })
  youtubeLink?: string;


  @IsOptional()
  @IsString({ message: "Bio should be a string." })
  bio?: string;

  @IsOptional()
  @IsString({ message: "Gender should be a string." })
  gender?: string;

  @IsOptional()
  // @IsDate()
  // @IsDateString({ message: "Date of birth should be a valid date string." })
  dob?: string;

  @IsOptional()
  @IsString({ message: "Email should be a string." })
  email: string;

  @IsOptional()
  @IsString({ message: "PhotoId should be a string." })
  photoId?: string;

  @IsOptional()
  @IsString({ message: "CoverPhoto should be a string." })
  coverPhotoId?: string;

  @IsOptional()
  @IsArray({ message: "Location should be an array." })
  @ValidateNested({ each: true })
  @Type(() => Location)
  location?: Location[];
}
