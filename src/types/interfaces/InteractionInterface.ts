import { InteractionType } from "../enums/InteractionTypeEnum";
import { IPostSchema } from "./postsInterface";
import { UserInterface } from "../UserInterface";
import { ICollection } from "./CollectionInterface";
import { HaveMeInterface } from "./HaveMeInterface";

export interface IInteractionSchema extends HaveMeInterface {
  _id?: string;
  id?: string;
  type: InteractionType;
  post: string | IPostSchema | any;
  user: string | UserInterface; // user which is owning this post
  interactedBy: string | UserInterface;
  comment?: string;
  collectionId?: string[] | ICollection[];
  replies?: string[] | IInteractionSchema[];
  likes?: string[] | IInteractionSchema[];
}
