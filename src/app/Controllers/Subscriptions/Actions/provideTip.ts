import { Request, Response } from "express";
import stripeInstance from "../../../../utils/stripe";
import { User } from "../../../Models/User";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { Transaction } from "../../../Models/Transaction";
import { UserInterface } from "../../../../types/UserInterface";
import { stripe_currency } from "../../../../utils/consts/stripeCurrency";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import { cardDetails } from "../../../Models/CardDetails";
import { Tips } from "../../../Models/Tip";
import { Post } from "../../../Models/Post";
import { ProductType } from "../../../../types/enums/productEnum";

export const provideTipToCreator = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { creatorId, tipAmount, message, tipOn } = req.body;

  const user = req.user as UserInterface;
  if (tipOn) {
    const post = await Post.findById(tipOn);
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

    const tip = new Tips({
      message: message,
      tipTo: creatorId,
      tipBy: user.id,
      tipOn: tipOn,
    });

    await tip.save();

    const card = await cardDetails.findOne({
      userId: user.id,
      isDefault: true,
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
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ error: { message: "Creator not found" } });
    }

    const price = await stripeInstance.prices.create({
      currency: stripe_currency,
      unit_amount: tipAmount,
      //   custom_unit_amount: {
      //     enabled: true,
      //   },
      product: creator?.stripeProductId,
    });

    if (!price.unit_amount) {
      return res.status(500).json({
        error: {
          message: "Failed to retrieve the unit amount for the price",
        },
      });
    }

    // const session = await stripeInstance.checkout.sessions.create({
    //   cancel_url: "https://example.com",
    //   line_items: [
    //     {
    //       price: price.unit_amount,
    //       quantity: 1,
    //     },
    //   ],
    //   mode: "payment",
    //   success_url: "https://example.com",
    // });

    // const paymentIntent = await stripeInstance.paymentIntents.create({
    //   amount: price.unit_amount,
    //   currency: stripe_currency,
    //   customer: user.stripeClientId,
    //   off_session: true,
    //   confirm: true,
    // });

    const paymentIntent = await stripeInstance.paymentIntents.create({
      amount: price.unit_amount,
      customer: user.stripeClientId,
      currency: stripe_currency,
      // payment_method: card.paymentMethodId,
      // off_session: true, // Required for automatic confirmation
      // confirm: true,
    });

    const newTransaction = new Transaction({
      userId: user?.id,
      stripeProductId: creator.stripeProductId,
      productId: tipOn ?? creator.id,
      type: TransactionType.DEBIT,
      productType: ProductType.TIPS,
      stripePaymentIntentId: paymentIntent.id,
      amount: price.unit_amount,
      status: TransactionStatus.PENDING,
    });

    await newTransaction.save();

    const newCreditTransaction = new Transaction({
      userId: creator?.id,
      stripePaymentIntentId: paymentIntent.id,
      type: TransactionType.CREDIT,
      stripeProductId: creator.stripeProductId,
      productId: tipOn ?? creator.id,
      productType: ProductType.TIPS,
      amount: price.unit_amount,
      status: TransactionStatus.PENDING,
    });

    await newCreditTransaction.save();

    return res.status(200).send({
      data: paymentIntent,
      paymentMethod: card.paymentMethodId,
    });
  } catch (error) {
    console.error("Error giving tip:", error);
    return res.status(400).send({ error: { message: error.message } });
  }
};
