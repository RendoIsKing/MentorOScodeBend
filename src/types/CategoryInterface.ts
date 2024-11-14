import {Document, Types} from "mongoose";

export interface CategoryInterface extends Document {
    _id: Types.ObjectId;
    moduleId: Types.ObjectId;
    title: string;
    video: string;
    isActive: boolean;
    activatedAt: Date;
    isDeleted: boolean;
    deletedAt: Date
}
