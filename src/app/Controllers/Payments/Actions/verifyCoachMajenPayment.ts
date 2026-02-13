import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import stripeInstance from "../../../../utils/stripe";
import { Transaction } from "../../../Models/Transaction";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { ProductType } from "../../../../types/enums/productEnum";

/**
 * Verify a Coach Majen Checkout Session by session_id.
 *
 * Called by the frontend after the user returns from Stripe Checkout.
 * - If the session is paid, marks the pending transaction as SUCCESS.
 * - Also has a generic check: if the user already has a SUCCESS coaching
 *   transaction, returns { paid: true } regardless of session_id.
 */
export const verifyCoachMajenPayment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const reqUser = req.user as UserInterface;
    if (!reqUser?.id) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    // 1. Quick check: does the user already have a successful coaching transaction?
    const existingSuccess = await Transaction.findOne({
      userId: reqUser.id,
      productType: ProductType.COACHING,
      status: TransactionStatus.SUCCESS,
    });

    if (existingSuccess) {
      return res.status(200).json({ paid: true });
    }

    // 2. If a session_id was provided, verify it with Stripe
    const sessionId = req.query.session_id as string;
    if (!sessionId) {
      return res.status(200).json({ paid: false });
    }

    const session = await stripeInstance.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ error: { message: "Session not found" } });
    }

    // Verify this session belongs to this user (via metadata)
    if (session.metadata?.userId !== String(reqUser.id)) {
      return res.status(403).json({ error: { message: "Session does not belong to this user" } });
    }

    if (session.payment_status === "paid") {
      // Mark the pending transaction as successful
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.id;

      // Update by session-linked payment intent or session id
      const updated = await Transaction.updateMany(
        {
          userId: reqUser.id,
          productType: ProductType.COACHING,
          status: TransactionStatus.PENDING,
          $or: [
            { stripePaymentIntentId: paymentIntentId },
            { stripePaymentIntentId: session.id },
          ],
        },
        { status: TransactionStatus.SUCCESS }
      );

      // If no pending transaction was found, create a success record
      if (updated.modifiedCount === 0) {
        await Transaction.create({
          userId: reqUser.id,
          amount: session.amount_total || 50000,
          type: "debit",
          productType: ProductType.COACHING,
          stripePaymentIntentId: paymentIntentId,
          status: TransactionStatus.SUCCESS,
        });
      }

      return res.status(200).json({ paid: true });
    }

    return res.status(200).json({ paid: false, paymentStatus: session.payment_status });
  } catch (error: any) {
    console.error("[verifyCoachMajenPayment] Error:", error);
    return res.status(500).json({
      error: { message: error.message || "Something went wrong." },
    });
  }
};
