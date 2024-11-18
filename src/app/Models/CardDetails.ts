import {model, Model} from 'mongoose';
import { CardDetailsInterface } from '../../types/interfaces/CardDetailsInterface';
import { CardDetailsSchema } from '../../database/schemas/cardDetailsSchema';


const cardDetails: Model<CardDetailsInterface> = model<CardDetailsInterface>('cardDetails', CardDetailsSchema);

export {cardDetails};
