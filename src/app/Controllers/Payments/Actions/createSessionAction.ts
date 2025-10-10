import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import createPaymentIntent from "./createPaymentIntent";
import stripeInstance from "../../../../utils/stripe";
import * as Sentry from '@sentry/node';
import { User } from "../../../Models/User";

export const createSessionAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const tx = process.env.SENTRY_DSN ? (Sentry as any)?.startTransaction?.({ name: 'payments.create-session' }) : undefined as any;
  try {
    const user = req.user as UserInterface;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || undefined;
    let data = {
      amount: 0,
      userId: user.id,
      clientStripeId: user.stripeClientId,
      idempotencyKey,
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

    const response: any = await createPaymentIntent(data as any);
    const sessionObject = {
      clientSecret: response?.client_secret ?? null,
      status: response?.status ?? null,
      sessionId: response?.id ?? null,
      type: response?.object || 'setup_intent',
    };
    try { Sentry.addBreadcrumb({ category: 'stripe', message: 'create-session', level: 'info', data: { status: sessionObject.status } }); } catch {}
    return res.json({ data: sessionObject });
  } catch (error) {
    return res.status(500).json({
      error: {
        message: "Something went wrong.",
      },
    });
  } finally { try { tx?.finish(); } catch {} }
};
