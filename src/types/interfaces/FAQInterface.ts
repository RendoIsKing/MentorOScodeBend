import { Document } from "mongoose";

interface Content {
  title: string;
  subContent: string[];
}

interface Topic {
  title: string;
  content: Content[];
}

export interface FAQInterface extends Document {
  topics: Topic[];
  isDeleted: boolean;
  deletedAt: Date | null;
}
