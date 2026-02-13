import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, findOne, updateById, Tables } from "../../../../lib/db";
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

    // Set all user's cards to non-default
    await db
      .from(Tables.CARD_DETAILS)
      .update({ is_default: false })
      .eq("user_id", user.id);

    // Set selected card as default
    const updatedCard = await updateById(Tables.CARD_DETAILS, cardId, {
      is_default: true,
    });

    if (!updatedCard || updatedCard.user_id !== user.id) {
      return res.status(404).json({
        error: {
          message:
            "Card not found or you do not have permission to update this card.",
        },
      });
    }

    try {
      await setDefaultCardOnStripe({
        paymentMethodId: updatedCard.payment_method_id,
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
