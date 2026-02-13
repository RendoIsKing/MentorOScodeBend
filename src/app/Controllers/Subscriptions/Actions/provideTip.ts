import { Request, Response } from "express";
import stripeInstance from "../../../../utils/stripe";
import { UserInterface } from "../../../../types/UserInterface";
import { findById, findOne, insertOne, Tables } from "../../../../lib/db";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { stripe_currency } from "../../../../utils/consts/stripeCurrency";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import { ProductType } from "../../../../types/enums/productEnum";

export const provideTipToCreator = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { creatorId, tipAmount, message, tipOn } = req.body;

  const user = req.user as UserInterface;
  if (tipOn) {
    const post = await findById(Tables.POSTS, tipOn);
    if (!post) {
      return res.status(404).json({
        error: {
          message: "Post Not Found",
        },
      });
    }
  }

  try {
    if (!creatorId || !tipAmount) {
      return res.status(404).json({
        error: {
          message:
            "creatorId or tipAmount is missing from the request body",
        },
      });
    }

    const tip = await insertOne(Tables.TIPS, {
      message: message,
      tip_to: creatorId,
      tip_by: user.id,
      tip_on: tipOn,
    });

    const card = await findOne(Tables.CARD_DETAILS, {
      user_id: user.id,
      is_default: true,
    });

    if (!card) {
      return res
        .status(404)
        .json({ error: { message: "Card not found for the user" } });
    }
    if (typeof tipAmount !== "number" || tipAmount <= 100) {
      return res.status(400).json({
        error: {
          message: "tipAmount must be a numerical value greater than 100 cents",
        },
      });
    }
    const creator = await findById(Tables.USERS, creatorId);
    if (!creator) {
      return res.status(404).json({ error: { message: "Creator not found" } });
    }

    const price = await stripeInstance.prices.create({
      currency: stripe_currency,
      unit_amount: tipAmount,
      product: creator?.stripe_product_id,
    });

    if (!price.unit_amount) {
      return res.status(500).json({
        error: {
          message: "Failed to retrieve the unit amount for the price",
        },
      });
    }

    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: price.unit_amount,
      customer: user.stripeClientId,
      currency: stripe_currency,
    });

    const newTransaction = await insertOne(Tables.TRANSACTIONS, {
      user_id: user.id,
      stripe_product_id: creator.stripe_product_id,
      product_id: tipOn ?? creator.id,
      type: TransactionType.DEBIT,
      product_type: ProductType.TIPS,
      stripe_payment_intent_id: paymentIntent.id,
      amount: price.unit_amount,
      status: TransactionStatus.PENDING,
    });

    const newCreditTransaction = await insertOne(Tables.TRANSACTIONS, {
      user_id: creator.id,
      stripe_payment_intent_id: paymentIntent.id,
      type: TransactionType.CREDIT,
      stripe_product_id: creator.stripe_product_id,
      product_id: tipOn ?? creator.id,
      product_type: ProductType.TIPS,
      amount: price.unit_amount,
      status: TransactionStatus.PENDING,
    });

    return res.status(200).send({
      data: paymentIntent,
      paymentMethod: card.payment_method_id,
    });
  } catch (error) {
    console.error("Error giving tip:", error);
    return res.status(400).send({ error: { message: error.message } });
  }
};
