import {model, Model} from 'mongoose';
import { ConnectionInterface } from '../../types/ConnectionInterface';
import { UserConnectionSchema } from '../../database/schemas/ConnectionsSchema';


const userConnection: Model<ConnectionInterface> = model<ConnectionInterface>('userConnection', UserConnectionSchema);

export {userConnection};
