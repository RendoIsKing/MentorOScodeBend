import { Router } from "express";
import { Auth, validateZod } from "../app/Middlewares";
import { SubscriptionPlanController } from "../app/Controllers/SubscriptionPlan";
import { z } from "zod";
import { objectIdParam } from "../app/Validation/requestSchemas";
import { SubscriptionPlanType } from "../types/enums/subscriptionPlanEnum";

const subscriptionPlan: Router = Router();
const entitlementSchema = z.object({
  feature: z.string(),
  description: z.string(),
}).strict();

const subscriptionPlanSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  price: z.number().optional(),
  duration: z.number().optional(),
  planType: z.nativeEnum(SubscriptionPlanType).optional(),
  entitlements: z.array(entitlementSchema).optional(),
}).strict();
subscriptionPlan.post(
  "/product",
  Auth,
  validateZod({ body: subscriptionPlanSchema }),
  SubscriptionPlanController.createProduct
);
subscriptionPlan.post("/", Auth, validateZod({ body: subscriptionPlanSchema }), SubscriptionPlanController.createPlan);
subscriptionPlan.get("/", Auth, SubscriptionPlanController.getSubscriptionPlan);
subscriptionPlan.post(
  "/:id",
  Auth,
  validateZod({ params: objectIdParam("id"), body: subscriptionPlanSchema }),
  SubscriptionPlanController.updateSubscriptionPlan
);
subscriptionPlan.delete(
  "/:id",
  Auth,
  validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }),
  SubscriptionPlanController.softDeleteSubscriptionPlan
);

subscriptionPlan.get(
  "/subscription",
  Auth,
  SubscriptionPlanController.oneSameSubscirptionPlanForAllUsers
);

export default subscriptionPlan;
