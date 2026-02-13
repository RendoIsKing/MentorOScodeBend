import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import stripeInstance from "../../../../utils/stripe";
import { User } from "../../../Models/User";
import { Transaction } from "../../../Models/Transaction";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import { ProductType } from "../../../../types/enums/productEnum";

/**
 * Coach Majen onboarding fee: 500 kr (one-time).
 * Stripe requires amounts in the smallest currency unit (500 kr * 100 = 50 000).
 */
const COACH_MAJEN_AMOUNT_ORE = 50000; // 500 kr
const COACH_MAJEN_CURRENCY = "nok";

/**
 * Create a Stripe Checkout Session for the Coach Majen onboarding fee.
 * Returns the checkout URL so the frontend can redirect the user.
 */
export const createCoachMajenCheckout = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const reqUser = req.user as UserInterface;
    if (!reqUser?.id) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const user = await User.findOne({
      _id: reqUser.id,
      isDeleted: false,
      deletedAt: null,
    });

    if (!user) {
      return res.status(404).json({ error: { message: "User not found" } });
    }

    // Ensure the user has a Stripe customer ID
    let stripeCustomerId = user.stripeClientId;
    if (!stripeCustomerId) {
      const customer = await stripeInstance.customers.create({
        email: user.email,
        name: user.fullName,
        metadata: { userId: String(user._id) },
      });
      stripeCustomerId = customer.id;
      await User.findByIdAndUpdate(user._id, {
        stripeClientId: customer.id,
        isStripeCustomer: true,
      });
    }

    // Check if user has already paid for Coach Majen
    const existingPayment = await Transaction.findOne({
      userId: user._id,
      productType: ProductType.COACHING,
      status: TransactionStatus.SUCCESS,
    });

    if (existingPayment) {
      return res.status(200).json({
        alreadyPaid: true,
        message: "Du har allerede betalt for Coach Majen onboarding.",
      });
    }

    // Derive the frontend origin for redirect URLs
    const frontendOrigin =
      process.env.FRONTEND_ORIGIN || "http://localhost:3002";

    // Create a Stripe Checkout Session
    const session = await stripeInstance.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: COACH_MAJEN_CURRENCY,
            unit_amount: COACH_MAJEN_AMOUNT_ORE,
            product_data: {
              name: "Coach Majen – Onboarding",
              description:
                "Personlig trenings- og kostholdsplan, aktivitetssporing, ubegrenset chat og AI-tilpasning.",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: String(user._id),
        productType: ProductType.COACHING,
        type: "coach_majen_onboarding",
      },
      success_url: `${frontendOrigin}/coach-majen?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendOrigin}/coach-majen?payment=cancelled`,
    });

    // Create a pending transaction
    await Transaction.create({
      userId: user._id,
      amount: COACH_MAJEN_AMOUNT_ORE,
      type: TransactionType.DEBIT,
      productType: ProductType.COACHING,
      stripePaymentIntentId: session.payment_intent || session.id,
      status: TransactionStatus.PENDING,
    });

    return res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error("[createCoachMajenCheckout] Error:", error);
    return res.status(500).json({
      error: { message: error.message || "Something went wrong." },
    });
  }
};
