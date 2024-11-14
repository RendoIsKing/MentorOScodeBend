import { Transform } from "class-transformer";
import { IsMongoId, IsString } from "class-validator";
import mongoose, { Types } from "mongoose";

export class OTPInput {
  @IsString({ message: "otp is required" })
  otp: string;

  @Transform((id) => new mongoose.Types.ObjectId(id.toString()), {
    toClassOnly: true,
  })
  @IsMongoId()
  id: Types.ObjectId;
}
