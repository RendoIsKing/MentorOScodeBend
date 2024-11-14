import {model, Model} from 'mongoose';

import {UserInterface} from '../../types/UserInterface';
import {UserSchema} from "../../database/schemas/UserSchema";

const User: Model<UserInterface> = model<UserInterface>('User', UserSchema);

export {User};
