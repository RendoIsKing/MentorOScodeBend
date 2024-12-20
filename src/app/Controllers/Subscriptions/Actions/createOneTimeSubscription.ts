import { Request, Response } from "express";
import stripeInstance from "../../../../utils/stripe";
import { UserInterface } from "../../../../types/UserInterface";
import { User } from "../../../Models/User";
import { cardDetails } from "../../../Models/CardDetails";
import { Post } from "../../../Models/Post";
import { Privacy } from "../../../../types/enums/privacyEnums";
import { Transaction } from "../../../Models/Transaction";
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
    console.log("subscirption api is hitting")
    const user = await User.findOne({
      _id: reqUser?.id,
      isDeleted: false,
      deletedAt: null,
    });
    console.log("postId is", postId)
    const post = await Post.findOne({
      _id: postId,
      privacy: Privacy.PAY_PER_VIEW,
      isDeleted: false,
      deletedAt: null,
    });

    if (!post) {
      return res.status(404).json({ error: { message: "Post not found" } });
    }

    if (!post.stripeProductId) {
      return res
        .status(404)
        .json({ error: { message: "Product not registerd on stripe" } });
    }

    if (!user) {
      return res.status(404).json({ error: { message: "User not found" } });
    }
    if (!user.isStripeCustomer == false && !user.stripeClientId) {
      return res
        .status(404)
        .json({ error: { message: "User not registerd on stripe" } });
    }
    
    console.log("ali User id is", user.id)
    const card = await cardDetails.findOne({
      userId: user.id,
      isDefault: true,
    });

    if (!card) {
      return res
        .status(404)
        .json({ error: { message: "Card not found for the user" } });
    }

    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: post.price,
      customer: user.stripeClientId,
      currency: stripe_currency,
      // payment_method: card.paymentMethodId,
      // off_session: true, // Required for automatic confirmation
      // confirm: true,
    });

    const newTransaction = new Transaction({
      userId: user?.id,
      stripePaymentIntentId: paymentIntent.id,
      stripeProductId: post.stripeProductId,
      type: TransactionType.DEBIT,
      productType: ProductType.POSTS,
      productId: post.id,
      amount: post.price,
      status: TransactionStatus.PENDING,
    });

    await newTransaction.save();

    const newCreditTransaction = new Transaction({
      userId: post?.user,
      stripePaymentIntentId: paymentIntent.id,
      type: TransactionType.CREDIT,
      stripeProductId: post.stripeProductId,
      productType: ProductType.POSTS,
      productId: post.id,
      amount: post.price,
      status: TransactionStatus.PENDING,
    });

    await newCreditTransaction.save();

    return res.status(200).send({
      data: paymentIntent,
      paymentMethod: card.paymentMethodId,
      // clientSecret: paymentIntent.client_secret,
      //@ts-ignore
      //   clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (error) {
    console.error("Error creating one time payment:", error);
    return res.status(400).send({ error: { message: error.message } });
  }
};
