import { Document, Types } from "mongoose";

export interface ModuleInterface extends Document {
    _id: Types.ObjectId;
    title: string;
}
