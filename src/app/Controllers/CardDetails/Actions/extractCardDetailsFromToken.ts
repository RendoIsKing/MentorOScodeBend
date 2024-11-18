import stripeInstance from "../../../../utils/stripe";

export const extractCardDetailsFromToken = async (tokenId: string) => {
  try {
    const tokenDetails = await stripeInstance.tokens.retrieve(tokenId);

    const cardDetails = tokenDetails.card;

    if (!cardDetails) {
      throw new Error("No card details found in the provided token.");
    }

    return cardDetails;
  } catch (error) {
    console.error("Error in extracting card details from token", error);
    throw error;
  }
};
