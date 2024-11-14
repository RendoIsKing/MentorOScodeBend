import { model, Model } from "mongoose";
import { PostSchema } from "../../database/schemas/postSchema";
import { IPostSchema } from "../../types/interfaces/postsInterface";

const Post: Model<IPostSchema> = model<IPostSchema>("Post", PostSchema);

export { Post };
