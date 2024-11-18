import { Schema, Types } from "mongoose";
import { TransactionStatus } from "../../types/enums/transactionStatusEnum";
import { TransactionType } from "../../types/enums/transactionTypeEnum";
import { ProductType } from "../../types/enums/productEnum";

const TransactionSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
    },
    amount: {
      type: Number,
    },
    title: {
      type: String,
      enum: Object.values(TransactionType),
    },
    currency: {
      type: String,
    },
    stripePaymentIntentId: {
      type: String,
    },
    stripeProductId: {
      type: String,
    },
    productId: {
      type: String,
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING,
    },
    type: {
      type: String,
      // enum:
      enum: [TransactionType.DEBIT, TransactionType.CREDIT],
      // enum: [...Object.values(TransactionType)],
      // default: null,
    },
    productType: {
      type: String,
      enum: [ProductType.POSTS, ProductType.SUBSCRIPTION, ProductType.TIPS] 
    }

  },
  {
    timestamps: true,
  }
);

export { TransactionSchema };
