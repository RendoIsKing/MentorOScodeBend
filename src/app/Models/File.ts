import {model, Model} from 'mongoose';
import { FileSchema } from '../../database/schemas/FileSchema';
import { FileInterface } from '../../types/FileInterface';


const File: Model<FileInterface> = model<FileInterface>('File', FileSchema);

export {File};
