import Stripe from "stripe";
import stripeInstance from ".";

interface IProduct {
  title: string;
  description: string;
  stripe_currency: string;
  price: number;
}

export const createPayPerViewProductOnStripe = async (
  product: IProduct
): Promise<Stripe.Response<Stripe.Product> | void> => {
  try {
    const stripePayPerViewProduct = await stripeInstance.products.create({
      name: product.title,
      description: product.description,
      metadata: {},
      default_price_data: {
        currency: product.stripe_currency,
        unit_amount: product.price,
        // name: body.name,
      },
    });

    return stripePayPerViewProduct;
  } catch (error) {
    console.log("Error creating pay per view product", error);
    // return error;
  }
};
