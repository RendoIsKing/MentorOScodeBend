import { Request, Response } from "express";
import { User } from "../../../Models/User";
import { Transaction } from "../../../Models/Transaction";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import stripeInstance from "../../../../utils/stripe";
import { Subscription } from "../../../Models/Subscription";
import { Types } from 'mongoose';
import * as Sentry from '@sentry/node';
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";
import { ProductType } from "../../../../types/enums/productEnum";

/**
 * Handle Stripe webhook events for payment/subscription updates.
 */
export const handlePaymentStatusWebhookStripe = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const stripe = stripeInstance;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).send(`Webhook Error: Missing Stripe signature.`);
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed.`, (err as any)?.message || err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try { Sentry.addBreadcrumb({ category: 'stripe', message: 'webhook', data: { type: event?.type } }); } catch {}
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.trial_will_end":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await handleSubscriptionEvent(event);
      break;
    case "payment_intent.created":
      await handlePaymentIntentCreated(event);
      break;
    case "payment_intent.succeeded":
      await handlePaymentSuccess(event);
      break;
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event);
      break;
    case "invoice.payment_failed":
    case "payment_intent.payment_failed":
      await handlePaymentFailed(event);
      break;
    default:
      break;
  }

  return res.json({ received: true });
};

/**
 * Handle subscription lifecycle events from Stripe.
 */
const handleSubscriptionEvent = async (event: any) => {
  const subscriptionData = event.data.object;

  try {
    let updatedSubscription = await Subscription.findOneAndUpdate(
      {
        StripeSubscriptionId: subscriptionData.id,
        status: SubscriptionStatusEnum.INACTIVE,
      },
      {
        status: SubscriptionStatusEnum.ACTIVE,
        startDate: new Date(subscriptionData.start_date * 1000),
        endDate: new Date(subscriptionData.current_period_end * 1000),
        stripeSubscriptionObject: JSON.stringify(subscriptionData),
      },
      { new: true }
    );

    if (!updatedSubscription) {
      // Fallback: upsert by user (metadata.userId or stripe customer -> User)
      let userId: any;
      const metaUserId = (subscriptionData?.metadata && (subscriptionData.metadata.userId || subscriptionData.metadata.userid)) || undefined;
      if (metaUserId) userId = metaUserId;
      if (!userId && subscriptionData?.customer) {
        try {
          const user = await User.findOne({ stripeClientId: subscriptionData.customer }).lean();
          if (user?._id) userId = String(user._id);
        } catch {}
      }
      if (!userId) {
        console.error('Unable to resolve user for subscription', typeof subscriptionData.customer === 'string' ? subscriptionData.customer.slice(-6) : 'unknown');
        return;
      }
      const priceId = (()=>{
        try { return subscriptionData?.items?.data?.[0]?.price?.id || ''; } catch { return ''; }
      })();
      updatedSubscription = await Subscription.findOneAndUpdate(
        { StripeSubscriptionId: subscriptionData.id },
        {
          userId: new Types.ObjectId(userId),
          planId: new Types.ObjectId(),
          StripeSubscriptionId: subscriptionData.id,
          StripePriceId: priceId || 'price_unknown',
          status: SubscriptionStatusEnum.ACTIVE,
          startDate: new Date(subscriptionData.start_date * 1000),
          endDate: new Date(subscriptionData.current_period_end * 1000),
          stripeSubscriptionObject: JSON.stringify(subscriptionData),
        },
        { upsert: true, new: true }
      );
    }

    try {
      if (!updatedSubscription) return; // TS guard
      // Mark user as subscribed and persist entitlement flag for access guard
      await User.updateOne({ _id: updatedSubscription.userId }, { $set: { status: 'SUBSCRIBED' } });
    } catch (e) {
      console.error('user entitlement update failed', e);
    }
    if (updatedSubscription) {
      try { Sentry.addBreadcrumb({ category: 'stripe', message: 'subscription-updated', data: { id: String(updatedSubscription._id) } }); } catch {}
    }
  } catch (error) {
    console.error("Error handling subscription event:", error);
  }
};

/**
 * Track payment intent creation events.
 */
const handlePaymentIntentCreated = async (event: any) => {
  const paymentIntent = event.data.object;
  try { Sentry.addBreadcrumb({ category: 'stripe', message: 'payment-intent-created', data: { id: paymentIntent?.id } }); } catch {}
};

/**
 * Update transactions on successful Stripe payments.
 */
const handlePaymentSuccess = async (event: any) => {
  const paymentIntent = event.data.object;
  const user = await User.findOne({ stripeClientId: paymentIntent.customer });
  if (!user) {
    console.error("User not found for customer ID:", typeof paymentIntent.customer === 'string' ? paymentIntent.customer.slice(-6) : 'unknown');
    return;
  }
  const updatedTransaction = await Transaction.updateMany(
    {
      stripePaymentIntentId: paymentIntent.id,
      status: TransactionStatus.PENDING,
    },
    {
      status: TransactionStatus.SUCCESS,
    },
    { new: true }
  );

  try { Sentry.addBreadcrumb({ category: 'stripe', message: 'payment-success', data: { count: updatedTransaction?.modifiedCount } }); } catch {}
};

/**
 * Handle completed Stripe Checkout Sessions (e.g. Coach Majen onboarding).
 */
const handleCheckoutSessionCompleted = async (event: any) => {
  const session = event.data.object;
  try {
    const userId = session?.metadata?.userId;
    const type = session?.metadata?.type;
    const productType = session?.metadata?.productType;

    if (!userId) {
      console.error("[checkout.session.completed] No userId in metadata");
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.id;

    if (session.payment_status === "paid") {
      // Update any pending transaction for this payment
      const updated = await Transaction.updateMany(
        {
          userId: new Types.ObjectId(userId),
          productType: productType || ProductType.COACHING,
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
          userId: new Types.ObjectId(userId),
          amount: session.amount_total || 0,
          type: "debit",
          productType: productType || ProductType.COACHING,
          stripePaymentIntentId: paymentIntentId,
          status: TransactionStatus.SUCCESS,
        });
      }

      console.log(`[checkout.session.completed] Payment confirmed for user ${userId}, type: ${type || "unknown"}`);
    }

    try {
      Sentry.addBreadcrumb({
        category: "stripe",
        message: "checkout-session-completed",
        data: { userId, type, paid: session.payment_status === "paid" },
      });
    } catch {}
  } catch (error) {
    console.error("[checkout.session.completed] Error:", error);
  }
};

/**
 * Update transactions on failed Stripe payments.
 */
const handlePaymentFailed = async (event: any) => {
  const paymentIntent = event.data.object;
  const user = await User.findOne({ stripeClientId: paymentIntent.customer });
  if (!user) {
    console.error("User not found for customer ID:", typeof paymentIntent.customer === 'string' ? paymentIntent.customer.slice(-6) : 'unknown');
    return;
  }

  const updatedTransaction = await Transaction.updateMany(
    {
      stripePaymentIntentId: paymentIntent.id,
      status: TransactionStatus.PENDING,
    },
    {
      status: TransactionStatus.FAILED,
    },
    { new: true }
  );

  await Transaction.create(updatedTransaction);
  try { Sentry.addBreadcrumb({ category: 'stripe', message: 'payment-failed', data: { count: updatedTransaction?.modifiedCount } }); } catch {}
};
