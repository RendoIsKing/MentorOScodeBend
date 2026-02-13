import { Router } from "express";
import PaymentsController from "../app/Controllers/Payments";
import { Auth, validateZod } from "../app/Middlewares";
import { z } from "zod";

const PaymentRoutes: Router = Router();

PaymentRoutes.post("/create-session", Auth as any, validateZod({ body: z.object({}).passthrough() }), PaymentsController.createSession);
PaymentRoutes.get("/status", Auth as any, PaymentsController.status);

// Coach Majen onboarding payment (500 NOK one-time via Stripe Checkout)
PaymentRoutes.post("/coach-majen-checkout", Auth as any, PaymentsController.coachMajenCheckout);
PaymentRoutes.get("/coach-majen-verify", Auth as any, PaymentsController.coachMajenVerify);

export default PaymentRoutes;
