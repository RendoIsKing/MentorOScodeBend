import { Router } from "express";
import PaymentsController from "../app/Controllers/Payments";
import { Auth, validateZod } from "../app/Middlewares";
import { z } from "zod";

const PaymentRoutes: Router = Router();

PaymentRoutes.post("/create-session", Auth as any, validateZod({ body: z.object({}).passthrough() }), PaymentsController.createSession);
PaymentRoutes.get("/status", Auth as any, PaymentsController.status);

export default PaymentRoutes;
