import { Router } from "express";
import { Auth, validateZod } from "../app/Middlewares";
import { z } from "zod";
import { objectId } from "../app/Validation/requestSchemas";
import { SubscriptionController } from "../app/Controllers/Subscriptions";

const SubscriptionRoutes: Router = Router();

const createSubscriptionSchema = z.object({
  planId: objectId,
  promoCode: z.string().trim().max(30).optional(),
});

const tipSchema = z.object({
  creatorId: objectId,
  tipAmount: z.number(),
  message: z.string().optional(),
  tipOn: objectId.optional(),
}).strict();

SubscriptionRoutes.post("/", Auth, validateZod({ body: createSubscriptionSchema }), SubscriptionController.createSubscription);
SubscriptionRoutes.post(
  "/one-time",
  Auth,
  validateZod({ body: z.object({}).passthrough() }),
  SubscriptionController.createOneTimePayment
);

SubscriptionRoutes.post(
  "/tip",
  Auth,
  validateZod({ body: tipSchema }),
  SubscriptionController.provideTipToCreator
);

export default SubscriptionRoutes;
