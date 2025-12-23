import { IsOptional, IsString, IsEmail, IsDateString, IsMongoId, IsBoolean, IsArray, IsNumber } from 'class-validator';

export class UpdateUserDTO {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  youtubeLink?: string;

  @IsOptional()
  @IsString()
  instagramLink?: string;

  @IsOptional()
  @IsString()
  tiktokLink?: string;

  @IsOptional()
  @IsString()
  facebookLink?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  dialCode?: string;

  @IsOptional()
  @IsMongoId()
  photoId?: string;

  @IsOptional()
  @IsMongoId()
  coverPhotoId?: string;

  // Mentor mode (UI/UX gating). Safe to toggle without changing permissions.
  @IsOptional()
  @IsBoolean()
  isMentor?: boolean;

  // Mentor profile fields (optional)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentorExpertise?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentorCertifications?: string[];

  @IsOptional()
  @IsNumber()
  mentorYearsExperience?: number;

  @IsOptional()
  @IsBoolean()
  mentorHasFreeTrial?: boolean;

  @IsOptional()
  @IsNumber()
  mentorRating?: number;

  @IsOptional()
  @IsNumber()
  mentorReviewCount?: number;

  // Mentor AI config (for the new design). Optional.
  @IsOptional()
  @IsString()
  mentorAiVoiceTone?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  mentorAiKnowledgeBaseFileIds?: string[];

  @IsOptional()
  @IsString()
  mentorAiTrainingPhilosophy?: string;

  @IsOptional()
  @IsString()
  mentorAiNutritionPhilosophy?: string;

  @IsOptional()
  @IsString()
  mentorAiMacroApproach?: string;

  @IsOptional()
  @IsString()
  mentorAiDietaryNotes?: string;


}
