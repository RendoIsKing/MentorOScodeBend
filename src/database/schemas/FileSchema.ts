import {Schema} from 'mongoose';


const FileSchema = new Schema({
    path: {
        type: String,
        required: true,
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

export {FileSchema};
