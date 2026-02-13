import { UserInterface } from "../UserInterface";
import { FileFormatEnum } from "../enums/fileFormatEnum";

export interface IUserData {
  _id?: string;
  id?: string;
  user: string | UserInterface;
  data: Record<string, any>;
  downloadBefore: Date;
  fileFormat: FileFormatEnum;
  isExpired: boolean;
}
