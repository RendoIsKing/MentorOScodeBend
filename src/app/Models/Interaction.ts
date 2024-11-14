import { model, Model } from "mongoose";
import { InteractionSchema } from "../../database/schemas/InteractionsSchema";
import { IInteractionSchema } from "../../types/interfaces/InteractionInterface";

const Interaction: Model<IInteractionSchema> = model<IInteractionSchema>(
  "Interaction",
  InteractionSchema
);

export { Interaction };
