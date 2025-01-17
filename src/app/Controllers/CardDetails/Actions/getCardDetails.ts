import { Request, Response } from "express";
import { extractCardDetailsFromToken } from "./extractCardDetailsFromToken";
import { cardDetails } from "../../../Models/CardDetails";
import { UserInterface } from "../../../../types/UserInterface";
import stripeInstance from "../../../../utils/stripe";

export const getCardDetails = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    

    const {tokenId} = req.body;
    const user = req.user as UserInterface;
    console.log("user ",user)

    if (!tokenId) {
      return res.status(400).json({ error: "Token ID is required" });
    }

    const paymentMethod = await stripeInstance.paymentMethods.create({
      type: "card",
      card: { token: tokenId },
    });

    const existingCards = await stripeInstance.paymentMethods.list({
      customer: user.stripeClientId,
      type: "card",
    });

    const isCardExist = existingCards.data.some((card) => {
      //@ts-ignore

      return card.card.fingerprint === paymentMethod.card.fingerprint;
    });

    if (isCardExist) {
      return res.status(400).json({ error: "Card already exists" });
    }

    const cardDetail = await extractCardDetailsFromToken(tokenId);

    await stripeInstance.paymentMethods.attach(paymentMethod.id, {
      customer: user.stripeClientId,
    });

    const userCardCount = await cardDetails.countDocuments({
      userId: user.id,
      isDeleted: false,
    });
    const isDefault = userCardCount === 0;

    const cardDetailsDocument = new cardDetails({
      userId: user.id,
      stripeCardId: cardDetail.id,
      object: cardDetail.object,
      address_city: cardDetail.address_city,
      address_country: cardDetail.address_country,
      brand: cardDetail.brand,
      country: cardDetail.country,
      cvc_check: cardDetail.cvc_check,
      dynamic_last4: cardDetail.dynamic_last4,
      exp_month: cardDetail.exp_month,
      exp_year: cardDetail.exp_year,
      fingerprint: cardDetail.fingerprint,
      funding: cardDetail.funding,
      last4: cardDetail.last4,
      tokenization_method: cardDetail.tokenization_method,
      paymentMethodId: paymentMethod.id,
      isActive: true,
      isDefault: isDefault,
      activatedAt: new Date(),
    });

    await stripeInstance.customers.update(
      user.stripeClientId,
      {
        // metadata: {
        //   order_id: '6735',
        // },
        invoice_settings: {
          default_payment_method: paymentMethod.id,
        },
      }
    );

    await stripeInstance.customers.retrieve(user.stripeClientId);

    await cardDetailsDocument.save();

    return res.json({
      message: "Card details saved successfully",
      cardDetails: cardDetailsDocument,
    });
  } catch (error) {
    console.error("Error in getting card details", error);
    return res.status(500).json({
      message: "Something went wrong",
      error: error.message,
    });
  }
};
