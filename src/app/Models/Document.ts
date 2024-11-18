import {model, Model} from 'mongoose';
import { DocumentSchema } from '../../database/schemas/DocumentSchema';
import { DocumentInterface } from '../../types/DocumentInterface';


const Document: Model<DocumentInterface> = model<DocumentInterface>('Document', DocumentSchema);

export {Document};
