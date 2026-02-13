import { TransactionStatus } from "./enums/transactionStatusEnum";
import { TransactionType } from "./enums/transactionTypeEnum";
import { ProductType } from "./enums/productEnum";

export interface ITransactionInterface {
  _id?: string;
  id?: string;
  amount: number;
  title: TransactionType;
  currency: string;
  status: TransactionStatus;
  type: TransactionType;
  userId: string;
  stripePaymentIntentId: string;
  stripeProductId: string;
  productId: string;
  productType: ProductType;
  refundId?: string | null;
  refundedAt?: Date | null;
}
