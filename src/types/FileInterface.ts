import { Document } from "mongoose";

export interface FileInterface extends Document {
  path: string;
  isDeleted: boolean;
  deletedAt: Date;
}
