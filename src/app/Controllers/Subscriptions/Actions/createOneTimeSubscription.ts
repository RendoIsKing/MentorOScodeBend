import { Request, Response } from "express";
import stripeInstance from "../../../../utils/stripe";
import { UserInterface } from "../../../../types/UserInterface";
import { findOne, insertOne, Tables } from "../../../../lib/db";
import { Privacy } from "../../../../types/enums/privacyEnums";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { stripe_currency } from "../../../../utils/consts/stripeCurrency";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import { ProductType } from "../../../../types/enums/productEnum";

export const createOneTimeSubscription = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { postId } = req.body;
  const reqUser = req.user as UserInterface;

  try {
    console.log("subscirption api is hitting");
    const user = await findOne(Tables.USERS, {
      id: reqUser?.id,
      is_deleted: false,
    });

    console.log("postId is", postId);
    const post = await findOne(Tables.POSTS, {
      id: postId,
      privacy: Privacy.PAY_PER_VIEW,
      is_deleted: false,
    });

    if (!post) {
      return res.status(404).json({ error: { message: "Post not found" } });
    }

    if (!post.stripe_product_id) {
      return res
        .status(404)
        .json({ error: { message: "Product not registerd on stripe" } });
    }

    if (!user) {
      return res.status(404).json({ error: { message: "User not found" } });
    }
    if (!user.is_stripe_customer == false && !user.stripe_client_id) {
      return res
        .status(404)
        .json({ error: { message: "User not registerd on stripe" } });
    }

    console.log("ali User id is", user.id);
    const card = await findOne(Tables.CARD_DETAILS, {
      user_id: user.id,
      is_default: true,
    });

    if (!card) {
      return res
        .status(404)
        .json({ error: { message: "Card not found for the user" } });
    }

    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: post.price,
      customer: user.stripe_client_id,
      currency: stripe_currency,
    });

    const newTransaction = await insertOne(Tables.TRANSACTIONS, {
      user_id: user.id,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_product_id: post.stripe_product_id,
      type: TransactionType.DEBIT,
      product_type: ProductType.POSTS,
      product_id: post.id,
      amount: post.price,
      status: TransactionStatus.PENDING,
    });

    const newCreditTransaction = await insertOne(Tables.TRANSACTIONS, {
      user_id: post.user_id,
      stripe_payment_intent_id: paymentIntent.id,
      type: TransactionType.CREDIT,
      stripe_product_id: post.stripe_product_id,
      product_type: ProductType.POSTS,
      product_id: post.id,
      amount: post.price,
      status: TransactionStatus.PENDING,
    });

    return res.status(200).send({
      data: paymentIntent,
      paymentMethod: card.payment_method_id,
    });
  } catch (error) {
    console.error("Error creating one time payment:", error);
    return res.status(400).send({ error: { message: error.message } });
  }
};
