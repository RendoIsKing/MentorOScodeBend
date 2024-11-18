import { model, Model } from "mongoose";
import { CollectionSchema } from "../../database/schemas/CollectionSchema";
import { ICollection } from "../../types/interfaces/CollectionInterface";

const Collection: Model<ICollection> = model<ICollection>(
  "Collection",
  CollectionSchema
);

export { Collection };
