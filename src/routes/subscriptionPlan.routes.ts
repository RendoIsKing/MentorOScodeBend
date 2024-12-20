import { Router } from "express";
import {  Auth } from "../app/Middlewares";
import { SubscriptionPlanController } from "../app/Controllers/SubscriptionPlan";

const subscriptionPlan: Router = Router();
subscriptionPlan.post("/product", Auth, SubscriptionPlanController.createProduct);
subscriptionPlan.post("/", Auth, SubscriptionPlanController.createPlan);
subscriptionPlan.get("/", Auth,SubscriptionPlanController.getSubscriptionPlan);
subscriptionPlan.post("/:id", Auth, SubscriptionPlanController.updateSubscriptionPlan);
subscriptionPlan.delete("/:id", Auth, SubscriptionPlanController.softDeleteSubscriptionPlan);

subscriptionPlan.get('/subscription', Auth, SubscriptionPlanController.oneSameSubscirptionPlanForAllUsers)

export default subscriptionPlan;
