import { Request, Response } from "express";
import stripe from "../../../../utils/stripe";
import { Transaction } from "../../../Models/Transaction";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";

export const refundTransaction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const transactionId = req.params.id;
    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: { message: "Transaction not found." } });
    }

    if (transaction.status === TransactionStatus.REFUNDED) {
      return res.status(400).json({ error: { message: "Transaction already refunded." } });
    }

    if (transaction.status !== TransactionStatus.SUCCESS) {
      return res.status(400).json({ error: { message: "Only successful transactions can be refunded." } });
    }

    if (!transaction.stripePaymentIntentId) {
      return res.status(400).json({ error: { message: "Missing Stripe payment intent." } });
    }

    const refund = await stripe.refunds.create({
      payment_intent: transaction.stripePaymentIntentId,
    });

    transaction.status = TransactionStatus.REFUNDED;
    transaction.refundId = refund.id;
    transaction.refundedAt = new Date();
    await transaction.save();

    return res.json({
      data: {
        refundId: refund.id,
        status: transaction.status,
      },
      message: "Transaction refunded successfully.",
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
