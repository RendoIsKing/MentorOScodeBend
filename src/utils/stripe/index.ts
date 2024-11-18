import Stripe from "stripe";

const stripeInstance = new Stripe(`${process.env.STRIPE_SECRET_KEY}`, {
  apiVersion: "2024-04-10",
});

export default stripeInstance;
