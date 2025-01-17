import {model, Model} from 'mongoose';
import { SubscriptionPlanSchema } from '../../database/schemas/SubscriptionPlanSchema';
import { SubscriptionPlanInterface } from '../../types/SubscriptionPlanInterface';


const SubscriptionPlan: Model<SubscriptionPlanInterface> = model<SubscriptionPlanInterface>('SubscriptionPlan', SubscriptionPlanSchema);

export {SubscriptionPlan};
