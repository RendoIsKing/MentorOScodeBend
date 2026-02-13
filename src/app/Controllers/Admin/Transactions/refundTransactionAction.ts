import { Request, Response } from "express";
import stripe from "../../../../utils/stripe";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { findById, updateById, Tables } from "../../../../lib/db";

export const refundTransaction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const transactionId = req.params.id;
    const transaction = await findById(Tables.TRANSACTIONS, transactionId);

    if (!transaction) {
      return res
        .status(404)
        .json({ error: { message: "Transaction not found." } });
    }

    if (transaction.status === TransactionStatus.REFUNDED) {
      return res
        .status(400)
        .json({ error: { message: "Transaction already refunded." } });
    }

    if (transaction.status !== TransactionStatus.SUCCESS) {
      return res.status(400).json({
        error: {
          message: "Only successful transactions can be refunded.",
        },
      });
    }

    if (!transaction.stripe_payment_intent_id) {
      return res
        .status(400)
        .json({ error: { message: "Missing Stripe payment intent." } });
    }

    const refund = await stripe.refunds.create({
      payment_intent: transaction.stripe_payment_intent_id,
    });

    await updateById(Tables.TRANSACTIONS, transactionId, {
      status: TransactionStatus.REFUNDED,
      refund_id: refund.id,
      refunded_at: new Date().toISOString(),
    });

    return res.json({
      data: {
        refundId: refund.id,
        status: TransactionStatus.REFUNDED,
      },
      message: "Transaction refunded successfully.",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
