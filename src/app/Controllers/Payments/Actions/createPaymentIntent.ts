import { Types } from "mongoose";
import stripeInstance from "../../../../utils/stripe";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import { Transaction } from "../../../Models/Transaction";

/**
 * Create a Stripe payment or setup intent and record transaction state.
 */
const createPaymentIntent = async (params: {
  amount: number;
  userId: Types.ObjectId;
  clientStripeId: string;
  idempotencyKey?: string;
}) => {
  try {
    if (!process.env.STRIPE_CURRENCY) {
      throw new Error("STRIPE_CURRENCY is mising");
    }
    if (params.amount === 0) {
      let intentInstance = await stripeInstance.setupIntents.create(
        {
          usage: "off_session",
          payment_method_types: ["card"],
          customer: params.clientStripeId,
          metadata: { userId: String(params.userId) },
        },
        params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined as any
      );

      await Transaction.create({
        userId: params.userId,
        amount: 0,
        type: TransactionType.CARD_ADD,
        status: TransactionStatus.SUCCESS,
        description: "Card added successfully",
        referenceId: intentInstance.id,
      });

      return intentInstance;
    } else {
      let paymentInstanceIntent = await stripeInstance.paymentIntents.create(
        {
          amount: params.amount,
          currency: `${process.env.STRIPE_CURRENCY}`,
          automatic_payment_methods: { enabled: true },
          customer: params.clientStripeId,
          metadata: { userId: String(params.userId) },
        },
        params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined as any
      );

      await Transaction.create({
        userId: params.userId,
        amount: params.amount,
        status: TransactionStatus.PENDING,
        description: "Balance adding transaction initiated",
        referenceId: paymentInstanceIntent.id,
      });
      return paymentInstanceIntent;
    }
  } catch (err) {
    await Transaction.create({
      userId: params.userId,
      amount: params.amount,
      status: TransactionStatus.FAILED,
      description: `Transaction failed: ${err.message}`,
      referenceId: null,
    });

    throw err;
  }
};

export default createPaymentIntent;
