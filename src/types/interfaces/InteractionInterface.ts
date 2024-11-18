import { Document, Types } from "mongoose";
import { InteractionType } from "../enums/InteractionTypeEnum";
import { IPostSchema } from "./postsInterface";
import { UserInterface } from "../UserInterface";
import { ICollection } from "./CollectionInterface";
import { HaveMeInterface } from "./HaveMeInterface";

export interface IInteractionSchema extends Document, HaveMeInterface {
  type: InteractionType;
  post: Types.ObjectId | IPostSchema | any;
  user: Types.ObjectId | UserInterface; // user which is owning this post
  interactedBy: Types.ObjectId | UserInterface;
  comment?: string;
  collectionId?: Types.ObjectId[] | ICollection[];
  replies?: Types.ObjectId[] | IInteractionSchema[];
  likes?: Types.ObjectId[] | IInteractionSchema[];
}
