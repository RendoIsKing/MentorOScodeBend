import { model, Model } from "mongoose";
import { MoreActionInterface } from "../../types/interfaces/MoreActionInterface";
import { MoreActionSchema } from "../../database/schemas/MoreActionsSchema";

const MoreAction: Model<MoreActionInterface> = model<MoreActionInterface>(
  "MoreAction",
  MoreActionSchema
);

export { MoreAction };
