import Stripe from "stripe";
import stripeInstance from ".";

interface ICard {
  paymentMethodId: string;
  customerId: string;
}

export const setDefaultCardOnStripe = async (
  card: ICard
): Promise<Stripe.Response<Stripe.Product> | void> => {
  try {
    // const stripeTipProduct = await stripeInstance.products.create({
    //   name: product.title,
    // });

    // return stripeTipProduct;

    // Set the default payment method for the customer
    await stripeInstance.customers.update(card.customerId, {
      invoice_settings: {
        default_payment_method: card.paymentMethodId,
      },
    });
  } catch (error) {
    console.error(error, "ERROR IN SETTING CARD AS DEFAULT ON STRIPE");
    // return error;
  }
};
