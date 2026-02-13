import { DocumentEnum } from "./DocumentEnum";
import { DocumentStatusEnum } from "./DocumentStatusEnum";

export interface DocumentInterface {
  _id?: string;
  id?: string;
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
