import {model, Model} from 'mongoose';
import { InterestInterface } from '../../types/InterestInterface';
import { InterestSchema } from '../../database/schemas/InterestSchema';


const Interest: Model<InterestInterface> = model<InterestInterface>('Interest', InterestSchema);

export {Interest};
