import {model, Model} from 'mongoose';
import { SubscriptionSchema } from '../../database/schemas/SubscriptionSchema';
import { SubscriptionInterface } from '../../types/subscriptionInterface';


const Subscription: Model<SubscriptionInterface> = model<SubscriptionInterface>('Subscription', SubscriptionSchema);

export {Subscription};
