import { Router } from "express";
import PaymentsController from "../app/Controllers/Payments";

const PaymentRoutes: Router = Router();

PaymentRoutes.get("/create-session", PaymentsController.createSession);

export default PaymentRoutes;
