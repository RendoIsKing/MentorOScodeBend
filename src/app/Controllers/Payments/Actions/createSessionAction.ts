import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import createPaymentIntent from "./createPaymentIntent";
import stripeInstance from "../../../../utils/stripe";
import { User } from "../../../Models/User";

export const createSessionAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    let data = {
      amount: 0,
      userId: user.id,
      clientStripeId: user.stripeClientId,
    };

    if (!user.stripeClientId) {
      const customer = await stripeInstance.customers.create({
        email: user.email,
        name: user.fullName,
      });
      user.stripeClientId = customer.id;
      await User.findByIdAndUpdate(user.id, {
        stripeClientId: customer.id,
        isStripeCustomer: true,
      });
      data.clientStripeId = customer.id;
    }

    const response: any = await createPaymentIntent(data);
    const sessionObject = {
      clientSecret: response?.client_secret ?? null,
      status: response?.status ?? null,
      sessionId: response?.id ?? null,
      type: response?.object || 'setup_intent',
    };
    return res.json({ data: sessionObject });
  } catch (error) {
    return res.status(500).json({
      error: {
        message: "Something went wrong.",
      },
    });
  }
};
