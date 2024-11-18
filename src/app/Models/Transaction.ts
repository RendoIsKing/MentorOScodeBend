import {model, Model} from 'mongoose';
import { ITransactionInterface } from '../../types/TransactionInterface';
import { TransactionSchema } from '../../database/schemas/transactionSchema';


const Transaction: Model<ITransactionInterface> = model<ITransactionInterface>('Transaction', TransactionSchema);

export {Transaction};
