import { Request, Response } from "express";
import { User } from "../../../Models/User";
import { Transaction } from "../../../Models/Transaction";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import stripeInstance from "../../../../utils/stripe";
import { Subscription } from "../../../Models/Subscription";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";

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
    console.log(`⚠️  Missing Stripe signature.`);
    return res.status(400).send(`Webhook Error: Missing Stripe signature.`);
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`⚠️  Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
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
      console.log(`Unhandled event type ${event.type}`);
  }

  return res.json({ received: true });
};

const handleSubscriptionEvent = async (event: any) => {
  const subscriptionData = event.data.object;
  console.log("Handling subscription event:", subscriptionData);

  try {
    const updatedSubscription = await Subscription.findOneAndUpdate(
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
      console.error(
        "Inactive subscription not found for subscription ID:",
        subscriptionData.id
      );
      return;
    }

    console.log("Subscription Updated:", updatedSubscription);
  } catch (error) {
    console.error("Error handling subscription event:", error);
  }
};

const handlePaymentIntentCreated = async (event: any) => {
  const paymentIntent = event.data.object;
  console.log("Payment Intent Created:", paymentIntent);
};

const handlePaymentSuccess = async (event: any) => {
  const paymentIntent = event.data.object;
  const user = await User.findOne({ stripeCustomerId: paymentIntent.customer });
  if (!user) {
    console.error("User not found for customer ID:", paymentIntent.customer);
    return;
  }
  console.log("paymentIntentpaymentIntent In webhook-->>", paymentIntent);

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

  console.log("Payment Success Transaction recorded:", updatedTransaction);
};

const handlePaymentFailed = async (event: any) => {
  const paymentIntent = event.data.object;
  const user = await User.findOne({ stripeCustomerId: paymentIntent.customer });
  if (!user) {
    console.error("User not found for customer ID:", paymentIntent.customer);
    return;
  }

  console.log("paymentIntentpaymentIntent In webhook-->>", paymentIntent);

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
  console.log("Payment Failed Transaction recorded:", updatedTransaction);
};
