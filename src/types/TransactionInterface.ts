import { Document, Types } from "mongoose";
import { TransactionStatus } from "./enums/transactionStatusEnum";
import { TransactionType } from "./enums/transactionTypeEnum";
import { ProductType } from "./enums/productEnum";

export interface ITransactionInterface extends Document {
  amount: number;
  title: TransactionType;
  currency: string;
  status: TransactionStatus;
  type: TransactionType;
  userId: Types.ObjectId;
  stripePaymentIntentId: string;
  stripeProductId: string;
  productId: string;
  productType: ProductType;
  refundId?: string | null;
  refundedAt?: Date | null;
}
