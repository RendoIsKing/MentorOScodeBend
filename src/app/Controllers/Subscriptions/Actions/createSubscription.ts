import { Request, Response } from "express";
import stripeInstance from "../../../../utils/stripe";
import { UserInterface } from "../../../../types/UserInterface";
import { findOne, findById, insertOne, Tables } from "../../../../lib/db";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import { cancelSubscriptions } from "./cancelSubscription";
import { ProductType } from "../../../../types/enums/productEnum";

export const createSubscription = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { planId } = req.body;
  const reqUser = req.user as UserInterface;

  try {
    const user = await findOne(Tables.USERS, {
      id: reqUser?.id,
      is_deleted: false,
    });

    const plan = await findById(Tables.SUBSCRIPTION_PLANS, planId);
    if (!plan || plan.is_deleted) {
      return res.status(404).json({ error: { message: "Plan not found" } });
    }

    if (!plan.stripe_product_object) {
      return res
        .status(404)
        .json({ error: { message: "Plan/Product not registerd on stripe" } });
    }

    console.log("Plan/Product registerd on stripe", plan.stripe_product_object);

    if (!user) {
      return res.status(404).json({ error: { message: "User not found" } });
    }
    if (!user.is_stripe_customer == false && !user.stripe_client_id) {
      return res
        .status(404)
        .json({ error: { message: "User not registerd on stripe" } });
    }

    const cancelParams = { userId: reqUser?.id || '' };
    await cancelSubscriptions(cancelParams);

    console.log("user.id ", user.id);
    const card = await findOne(Tables.CARD_DETAILS, {
      user_id: user.id,
      is_default: true,
    });

    console.log("User card details is", card);
    if (!card) {
      return res
        .status(404)
        .json({ error: { message: "Card not found for the user" } });
    }
    console.log("card.payment_method_id ", card.payment_method_id);
    console.log("user.stripe_client_id ", user.stripe_client_id);
    const paymentMethod = await stripeInstance.paymentMethods.retrieve(
      card.payment_method_id
    );
    console.log("paymentMethod ", paymentMethod);

    const subscription = await stripeInstance.subscriptions.create({
      customer: user.stripe_client_id,
      default_payment_method: card.payment_method_id,
      items: [
        {
          price: plan.stripe_product_object.default_price,
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
    });
    console.log("subscription ", subscription);

    const latestInvoice = subscription.latest_invoice;
    console.log("latestInvoice ", latestInvoice);

    if (!latestInvoice || typeof latestInvoice === "string") {
      throw new Error("Kunne ikke hente faktura for abonnementet.");
    }

    // Extract payment intent from the expanded invoice
    const paymentIntent = latestInvoice.payment_intent;
    let clientSecret: string | null = null;

    if (paymentIntent && typeof paymentIntent !== "string") {
      clientSecret = paymentIntent.client_secret ?? null;
    }

    await insertOne(Tables.SUBSCRIPTIONS, {
      user_id: user.id,
      plan_id: plan.id,
      stripe_subscription_id: subscription.id,
      stripe_price_id: plan.stripe_product_object.default_price,
      status: SubscriptionStatusEnum.ACTIVE,
      stripe_subscription_object: JSON.stringify(subscription),
    });

    await insertOne(Tables.TRANSACTIONS, {
      user_id: user.id,
      stripe_payment_intent_id: typeof paymentIntent === "object" && paymentIntent?.id ? paymentIntent.id : undefined,
      type: TransactionType.DEBIT,
      product_type: ProductType.SUBSCRIPTION,
      stripe_product_id: plan.stripe_product_id,
      product_id: plan.id,
      amount: plan.price,
      status: TransactionStatus.PENDING,
    });

    return res.status(200).send({
      status: true,
      subscriptionId: subscription.id,
      clientSecret,
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return res.status(400).send({ error: { message: error.message } });
  }
};
