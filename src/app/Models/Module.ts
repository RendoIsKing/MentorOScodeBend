import {model, Model} from 'mongoose';

import {ModuleSchema} from "../../database/schemas/ModuleSchema";
import {ModuleInterface} from "../../types/ModuleInterface";

const Module: Model<ModuleInterface> = model<ModuleInterface>('Module', ModuleSchema);

export {Module};
