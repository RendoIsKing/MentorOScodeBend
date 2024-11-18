import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { cardDetails } from "../../../Models/CardDetails";
import { setDefaultCardOnStripe } from "../../../../utils/stripe/setDefaultCardOnStripe";

export const setDefaultCard = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const { cardId } = req.params;

    if (!user) {
      return res.status(404).json({ error: { message: "User not found." } });
    }

    if (!cardId) {
      return res
        .status(400)
        .json({ error: { message: "Card ID is required." } });
    }

    await cardDetails.updateMany(
      { userId: user._id },
      { $set: { isDefault: false } }
    );

    const updatedCard = await cardDetails.findOneAndUpdate(
      { _id: cardId, userId: user._id },
      { $set: { isDefault: true } },
      { new: true }
    );

    if (!updatedCard) {
      return res.status(404).json({
        error: {
          message:
            "Card not found or you do not have permission to update this card.",
        },
      });
    }

    try {
      await setDefaultCardOnStripe({
        paymentMethodId: updatedCard.paymentMethodId,
        customerId: user.stripeClientId,
      });
    } catch (error) {
      console.error("Error setting card as default on stripe", error);
    }

    return res.json({
      message: "Default card updated successfully.",
      card: updatedCard,
    });
  } catch (error) {
    console.error(error, "Error in setting default card");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
