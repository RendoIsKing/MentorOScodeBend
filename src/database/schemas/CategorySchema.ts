import { Schema, Types } from "mongoose";

const CategorySchema = new Schema({
    moduleId: {
        type: Types.ObjectId,
        default: null,
        ref: "Module",
    },
    parentId: {
        type: Types.ObjectId,
        default: null,
        ref: "Category",
    },
    title: {
        type: String,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: false
    },
    activatedAt: {
        type: Date,
        default: null
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    },

}, {timestamps: true});

export {CategorySchema};
