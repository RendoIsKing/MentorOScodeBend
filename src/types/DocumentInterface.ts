import { Document } from "mongoose";
import { DocumentEnum } from "./DocumentEnum";
import { DocumentStatusEnum } from "./DocumentStatusEnum";

export interface DocumentInterface extends Document {
  title: string;
  description: string;
  dob: string;
  userId: string;
  verifiedAt: string;
  type: DocumentEnum;
  status: DocumentStatusEnum;
  documentMediaId: string;
  isDeleted: boolean;
  deletedAt: Date;
}
