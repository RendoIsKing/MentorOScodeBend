import { Document } from "mongoose";


export interface InterestInterface extends Document {
  title: string;
  slug: string;
  addedBy: string;
  isAvailable: boolean;
  isDeleted: boolean;
  deletedAt: Date;
}
