import { model, Model } from "mongoose";

import { FAQInterface } from "../../types/interfaces/FAQInterface";
import { FAQSchema } from "../../database/schemas/FAQSchema";

const FAQ: Model<FAQInterface> = model<FAQInterface>("FAQ", FAQSchema);

export { FAQ };
