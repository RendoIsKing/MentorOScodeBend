import { Router } from "express";
import PaymentsController from "../app/Controllers/Payments";
import { Auth } from "../app/Middlewares";

const PaymentRoutes: Router = Router();

PaymentRoutes.post("/create-session", Auth as any, PaymentsController.createSession);
PaymentRoutes.get("/status", Auth as any, PaymentsController.status);

export default PaymentRoutes;
