import { Document, Types } from "mongoose";
import { UserInterface } from "../UserInterface";
import { FileFormatEnum } from "../enums/fileFormatEnum";

export interface IUserData extends Document {
  user: Types.ObjectId | UserInterface;
  data: Record<string, any>;
  downloadBefore: Date;
  fileFormat: FileFormatEnum;
  isExpired: boolean;
}
