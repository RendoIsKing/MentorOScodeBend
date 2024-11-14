import mongoose, { Document } from "mongoose";

export interface TipInterface extends Document {
  message: string;
  tipTo: mongoose.Types.ObjectId;
  tipBy: mongoose.Types.ObjectId;
}
