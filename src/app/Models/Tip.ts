import { model, Model } from "mongoose";

import { TipInterface } from "../../types/interfaces/TipInterface";
import { TipsSchema } from "../../database/schemas/TipSchema";

const Tips: Model<TipInterface> = model<TipInterface>("tips", TipsSchema);

export { Tips };
