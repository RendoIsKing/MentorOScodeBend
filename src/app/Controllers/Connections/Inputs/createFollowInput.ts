import {  IsMongoId, IsNotEmpty } from "class-validator";

export class FollowInput {

  @IsNotEmpty()
  @IsMongoId({ message: "FollowingTo must be a valid MongoId." })
  followingTo: string;



}
    