import { Document } from "mongoose";
import { Privacy } from "../enums/privacyEnums";
import { PostStatusEnum } from "../enums/postStatuseEnum";
import { UserInterface } from "../UserInterface";
import { HaveMeInterface } from "./HaveMeInterface";
import { MediaDto } from "../../app/Controllers/Posts/Inputs/createPost.input";
import { PostType } from "../enums/postTypeEnum";

export interface IPostSchema extends HaveMeInterface, Document {
  content: string;
  orientation: string;
  media: MediaDto[];
  tags: string[];
  accessibleTo: [];
  userTags: [];
  privacy: Privacy;
  price: number;
  isPinned: boolean;
  status: PostStatusEnum;
  user: UserInterface;
  type: PostType;
  stripeProductId: String;
  stripeProduct: {} | any;
}
