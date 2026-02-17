import stripeInstance from "../../../../utils/stripe";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { insertOne, Tables } from "../../../../lib/db";

// Enum values now match Supabase directly (PENDING, COMPLETED, FAILED, REFUNDED)
const toDbStatus = (s: TransactionStatus) => s;

/**
 * Create a Stripe payment or setup intent and record transaction state.
 */
const createPaymentIntent = async (params: {
  amount: number;
  userId: string;
  clientStripeId: string;
  idempotencyKey?: string;
}) => {
  try {
    if (!process.env.STRIPE_CURRENCY) {
      throw new Error("STRIPE_CURRENCY is missing");
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

      await insertOne(Tables.TRANSACTIONS, {
        user_id: params.userId,
        amount: 0,
        type: null, // CARD_ADD not in Supabase enum; use null
        status: toDbStatus(TransactionStatus.SUCCESS),
        title: "Card added successfully",
        stripe_payment_intent_id: intentInstance.id,
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

      await insertOne(Tables.TRANSACTIONS, {
        user_id: params.userId,
        amount: params.amount,
        status: toDbStatus(TransactionStatus.PENDING),
        title: "Balance adding transaction initiated",
        stripe_payment_intent_id: paymentInstanceIntent.id,
      });
      return paymentInstanceIntent;
    }
  } catch (err) {
    await insertOne(Tables.TRANSACTIONS, {
      user_id: params.userId,
      amount: params.amount,
      status: toDbStatus(TransactionStatus.FAILED),
      title: `Transaction failed: ${(err as Error).message}`,
      stripe_payment_intent_id: null,
    });

    throw err;
  }
};

export default createPaymentIntent;
