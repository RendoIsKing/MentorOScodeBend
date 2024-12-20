import { Request, Response } from "express";
import stripeInstance from "../../../../utils/stripe";
import { UserInterface } from "../../../../types/UserInterface";
import { User } from "../../../Models/User";
import { Subscription } from "../../../Models/Subscription";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { cardDetails } from "../../../Models/CardDetails";
import { Transaction } from "../../../Models/Transaction";
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
    const user = await User.findOne({
      _id: reqUser?.id,
      isDeleted: false,
      deletedAt: null,
    });
    //why find subscription plan => as the data added in table with each user
    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      isDeleted: false,
      deletedAt: null,
    });
    if (!plan) {
      return res.status(404).json({ error: { message: "Plan not found" } });
    }

    if (!plan.stripeProductObject) {
      return res
        .status(404)
        .json({ error: { message: "Plan/Product not registerd on stripe" } });
    }

    console.log("Plan/Product registerd on stripe", plan.stripeProductObject )

    if (!user) {
      return res.status(404).json({ error: { message: "User not found" } });
    }
    if (!user.isStripeCustomer == false && !user.stripeClientId) {
      return res
        .status(404)
        .json({ error: { message: "User not registerd on stripe" } });
    }

    const cancelParams = { userId: reqUser?.id };
    await cancelSubscriptions(cancelParams);

    // FIXME: cardDetails should be CardDetail
    // Always have Class names with first letter capital
    console.log("user.id ",user.id)
    const card = await cardDetails.findOne({
      userId: user.id,
      isDefault: true,
    });

    console.log("User card details is", card)
    if (!card) {
      return res
        .status(404)
        .json({ error: { message: "Card not found for the user" } });
    }
    console.log("card.paymentMethodId ",card.paymentMethodId)
    console.log("user.stripeClientId ",user.stripeClientId)
    const paymentMethod = await stripeInstance.paymentMethods.retrieve(
      card.paymentMethodId
    );
    console.log("paymentMethod ",paymentMethod)

    const subscription = await stripeInstance.subscriptions.create({
      customer: user.stripeClientId,
      default_payment_method: card.paymentMethodId,
      items: [
        {
          price: plan.stripeProductObject.default_price,
        },
      ],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
    });
    console.log("subscription ",subscription)

    const latestInvoice = subscription.latest_invoice;
    console.log("latestInvoice ",latestInvoice)

    if (!latestInvoice || typeof latestInvoice === "string") {
      throw new Error("Failed to retrieve latest invoice.");
    }

    const paymentIntent = latestInvoice.payment_intent;
    console.log("paymentIntent ",paymentIntent)

    if (!paymentIntent) {
      console.error(
        "Payment intent is null for subscription:",
        subscription.id
      );
      return res.status(400).send({
        error: { message: "Payment intent is null. Please try again." },
      });
    }

    const newSubscription = new Subscription({
      userId: user?.id,
      planId: plan.id,
      StripeSubscriptionId: subscription.id,
      StripePriceId: plan.stripeProductObject.default_price,
      status: SubscriptionStatusEnum.INACTIVE,
      stripeSubscriptionObject: JSON.stringify(subscription),
    });

    await newSubscription.save();

    const newDebitTransaction = new Transaction({
      userId: user?.id,
      stripePaymentIntentId: paymentIntent.id,
      type: TransactionType.DEBIT,
      productType: ProductType.SUBSCRIPTION,
      stripeProductId: plan.stripeProductId,
      productId: plan.id,
      amount: plan.price,
      status: TransactionStatus.PENDING,
    });

    await newDebitTransaction.save();

    const newCreditTransaction = new Transaction({
      userId: plan?.userId,
      stripePaymentIntentId: paymentIntent.id,
      type: TransactionType.CREDIT,
      productType: ProductType.SUBSCRIPTION,
      stripeProductId: plan.stripeProductId,
      productId: plan.id,
      amount: plan.price,
      status: TransactionStatus.PENDING,
    });

    await newCreditTransaction.save();

    return res.status(200).send({
      subscriptionId: subscription.id,
      // clientSecret: paymentIntent.client_secret,
      //@ts-ignore
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    return res.status(400).send({ error: { message: error.message } });
  }
};
