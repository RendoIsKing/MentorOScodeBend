import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { cardDetails } from "../../../Models/CardDetails";
// import stripeInstance from "../../../../utils/stripe";

export const deleteCard = async (
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

    const card = await cardDetails.findOne({
      _id: cardId,
      userId: user._id,
      isDeleted: false,
    });

    // const customerSource = await stripeInstance.customers.deleteSource(
    //   user.stripeClientId,
    //   card.stripeCardId
    // );

    if (card) {
      card.isDeleted = true;
      card.deletedAt = new Date();
      await card.save();

      return res.json({ message: "Card deleted successfully." });
    } else {
      return res.status(404).json({
        error: {
          message:
            "Card not found or you do not have permission to delete this card.",
        },
      });
    }
  } catch (error) {
    console.error(error, "Error in deleting card");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
