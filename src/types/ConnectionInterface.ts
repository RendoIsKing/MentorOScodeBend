import {Document, Types} from "mongoose";

export interface ConnectionInterface extends Document {
    owner: Types.ObjectId;
    followingTo: Types.ObjectId;
}
