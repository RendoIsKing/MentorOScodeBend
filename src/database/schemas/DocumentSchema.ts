import {Schema, Types} from 'mongoose';
import { DocumentEnum } from '../../types/DocumentEnum';
import { DocumentStatusEnum } from '../../types/DocumentStatusEnum';

const DocumentSchema = new Schema({
    title: {
        type: String,
        required: false,
    },
    description: {
        type: String,
        required: false,
    },
    userId: {
        type: Types.ObjectId,
        required: true,
        ref: "User",
    },
    documentMediaId: {
        type: Types.ObjectId,
        required: true,
        ref: "File"
    },   
    verifiedAt: {
        type: Date,
        default: null
    },
    verifiedBy: {
        type: String,
        default: null
    },
    type: {
        type: String,
        enum: Object.values(DocumentEnum), 
        required: false 
    },
    status: {
        type: String,
        required: false,
        default: DocumentStatusEnum.Pending
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

export {DocumentSchema};
