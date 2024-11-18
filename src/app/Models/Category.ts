import {model, Model} from 'mongoose';

import {CategorySchema} from "../../database/schemas/CategorySchema";
import {CategoryInterface} from "../../types/CategoryInterface";



const Category: Model<CategoryInterface> = model<CategoryInterface>('Category', CategorySchema);

export {Category};
