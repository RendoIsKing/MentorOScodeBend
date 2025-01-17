import { Router } from "express";
import { Auth } from "../app/Middlewares";
import { SubscriptionController } from "../app/Controllers/Subscriptions";

const SubscriptionRoutes: Router = Router();

SubscriptionRoutes.post("/", Auth, SubscriptionController.createSubscription);
SubscriptionRoutes.post(
  "/one-time",
  Auth,
  SubscriptionController.createOneTimePayment
);

SubscriptionRoutes.post(
  "/tip",
  Auth,
  SubscriptionController.provideTipToCreator
);

export default SubscriptionRoutes;
