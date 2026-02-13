import { Request, Response } from "express";
import stripeInstance from "../../../../utils/stripe";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";
import * as Sentry from "@sentry/node";
import { db, findOne, updateById, upsert, insertOne, Tables } from "../../../../lib/db";

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
    console.error(
      `Webhook signature verification failed.`,
      (err as any)?.message || err
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    Sentry.addBreadcrumb({
      category: "stripe",
      message: "webhook",
      data: { type: event?.type },
    });
  } catch {}
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
    // Try to find and update existing subscription
    const existing = await findOne(Tables.SUBSCRIPTIONS, {
      stripe_subscription_id: subscriptionData.id,
      status: SubscriptionStatusEnum.INACTIVE,
    });

    let updatedSubscription;

    if (existing) {
      updatedSubscription = await updateById(Tables.SUBSCRIPTIONS, existing.id, {
        status: SubscriptionStatusEnum.ACTIVE,
        start_date: new Date(subscriptionData.start_date * 1000).toISOString(),
        end_date: new Date(
          subscriptionData.current_period_end * 1000
        ).toISOString(),
        stripe_subscription_object: JSON.stringify(subscriptionData),
      });
    } else {
      // Fallback: resolve userId from metadata or stripe customer
      let userId: string | undefined;
      const metaUserId =
        subscriptionData?.metadata?.userId ||
        subscriptionData?.metadata?.userid;
      if (metaUserId) userId = metaUserId;

      if (!userId && subscriptionData?.customer) {
        try {
          const user = await findOne(Tables.USERS, {
            stripe_client_id: subscriptionData.customer,
          });
          if (user?.id) userId = user.id;
        } catch {}
      }

      if (!userId) {
        console.error(
          "Unable to resolve user for subscription",
          typeof subscriptionData.customer === "string"
            ? subscriptionData.customer.slice(-6)
            : "unknown"
        );
        return;
      }

      const priceId = (() => {
        try {
          return subscriptionData?.items?.data?.[0]?.price?.id || "";
        } catch {
          return "";
        }
      })();

      updatedSubscription = await upsert(
        Tables.SUBSCRIPTIONS,
        {
          stripe_subscription_id: subscriptionData.id,
          user_id: userId,
          stripe_price_id: priceId || "price_unknown",
          status: SubscriptionStatusEnum.ACTIVE,
          start_date: new Date(
            subscriptionData.start_date * 1000
          ).toISOString(),
          end_date: new Date(
            subscriptionData.current_period_end * 1000
          ).toISOString(),
          stripe_subscription_object: JSON.stringify(subscriptionData),
        },
        "stripe_subscription_id"
      );
    }

    try {
      if (!updatedSubscription) return;
      await updateById(Tables.USERS, updatedSubscription.user_id, {
        status: "SUBSCRIBED",
      });
    } catch (e) {
      console.error("user entitlement update failed", e);
    }
    if (updatedSubscription) {
      try {
        Sentry.addBreadcrumb({
          category: "stripe",
          message: "subscription-updated",
          data: { id: String(updatedSubscription.id) },
        });
      } catch {}
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
  try {
    Sentry.addBreadcrumb({
      category: "stripe",
      message: "payment-intent-created",
      data: { id: paymentIntent?.id },
    });
  } catch {}
};

/**
 * Update transactions on successful Stripe payments.
 */
const handlePaymentSuccess = async (event: any) => {
  const paymentIntent = event.data.object;
  const user = await findOne(Tables.USERS, {
    stripe_client_id: paymentIntent.customer,
  });
  if (!user) {
    console.error(
      "User not found for customer ID:",
      typeof paymentIntent.customer === "string"
        ? paymentIntent.customer.slice(-6)
        : "unknown"
    );
    return;
  }

  await db
    .from(Tables.TRANSACTIONS)
    .update({ status: TransactionStatus.SUCCESS })
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .eq("status", TransactionStatus.PENDING);

  try {
    Sentry.addBreadcrumb({
      category: "stripe",
      message: "payment-success",
      data: {},
    });
  } catch {}
};

/**
 * Update transactions on failed Stripe payments.
 */
const handlePaymentFailed = async (event: any) => {
  const paymentIntent = event.data.object;
  const user = await findOne(Tables.USERS, {
    stripe_client_id: paymentIntent.customer,
  });
  if (!user) {
    console.error(
      "User not found for customer ID:",
      typeof paymentIntent.customer === "string"
        ? paymentIntent.customer.slice(-6)
        : "unknown"
    );
    return;
  }

  await db
    .from(Tables.TRANSACTIONS)
    .update({ status: TransactionStatus.FAILED })
    .eq("stripe_payment_intent_id", paymentIntent.id)
    .eq("status", TransactionStatus.PENDING);

  try {
    Sentry.addBreadcrumb({
      category: "stripe",
      message: "payment-failed",
      data: {},
    });
  } catch {}
};
