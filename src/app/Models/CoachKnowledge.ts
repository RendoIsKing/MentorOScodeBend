import { model, Model } from 'mongoose';
import { CoachKnowledgeSchema, ICoachKnowledge } from '../../database/schemas/CoachKnowledgeSchema';

const CoachKnowledge: Model<ICoachKnowledge> = model<ICoachKnowledge>('CoachKnowledge', CoachKnowledgeSchema);

export { CoachKnowledge };



