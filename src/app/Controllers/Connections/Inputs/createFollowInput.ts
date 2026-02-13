import { IsNotEmpty, IsString } from "class-validator";

export class FollowInput {

  @IsNotEmpty()
  @IsString({ message: "FollowingTo must be a valid ID." })
  followingTo: string;

}
