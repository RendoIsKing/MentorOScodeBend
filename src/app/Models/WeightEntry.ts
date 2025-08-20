import { model, Model } from 'mongoose';
import { IWeightEntry, WeightEntrySchema } from '../../database/schemas/WeightEntrySchema';

const WeightEntry: Model<IWeightEntry> = model<IWeightEntry>('WeightEntry', WeightEntrySchema);

export { WeightEntry };


