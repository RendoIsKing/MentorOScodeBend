import { Router } from "express";
import { Auth, OnlyAdmins } from "../app/Middlewares";
import { TransactionController } from "../app/Controllers/Transactions";

const TransactionRoutes: Router = Router();
TransactionRoutes.get("/", Auth, TransactionController.getOwnTransactions);
TransactionRoutes.get(
  "/all",
  OnlyAdmins,
  TransactionController.getAllTransactions
);

export default TransactionRoutes;
