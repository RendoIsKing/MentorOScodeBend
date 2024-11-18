import {model, Model} from 'mongoose';
import { FeatureSchema } from '../../database/schemas/featureSchema';
import { FeatureInterface } from '../../types/FeatureInterface';


const Feature: Model<FeatureInterface> = model<FeatureInterface>('Feature', FeatureSchema);

export {Feature};
