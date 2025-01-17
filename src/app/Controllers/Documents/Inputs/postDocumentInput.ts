import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { DocumentEnum } from "../../../../types/DocumentEnum";

export class DocumentInput {

  @IsNotEmpty()
  @IsString({ message: "title is required." })
  title: string;

  @IsOptional()
  @IsString({ message: "description should be valid." })
  description: string;

  
  @IsOptional()
  @IsString({ message: "userId is required." })
  userId: string;

  @IsNotEmpty()
  @IsString({ message: "documentId is required." })
  documentMediaId: string;

  @IsOptional()
  @IsEnum(DocumentEnum, { message: "Type should be a valid document type." })
  type?: DocumentEnum;

}
