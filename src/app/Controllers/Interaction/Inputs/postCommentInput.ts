import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CommentInput {
  @IsNotEmpty({ message: "Comment is required." })
  @IsString({ message: "Comment must be a string." })
  @MaxLength(1000, { message: "Comment must not exceed 1000 characters." })
  comment: string;
}
