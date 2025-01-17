import Stripe from "stripe";
import stripeInstance from ".";

interface ITipProduct {
  title: string;
}

export const createTipProductOnStripe = async (
  product: ITipProduct
): Promise<Stripe.Response<Stripe.Product> | void> => {
  try {
    const stripeTipProduct = await stripeInstance.products.create({
      name: product.title,
    });

    return stripeTipProduct;
  } catch (error) {
    console.error(error, "ERROR IN CREATING TIP PRODUCT");
    // return error;
  }
};
