import { Router } from "express";
import { z } from "zod";
import OnlyAdmins from "../app/Middlewares/onlyAdmins";
import { validateZod } from "../app/Middlewares/validateZod";
import { objectIdParam } from "../app/Validation/requestSchemas";
import { getDashboardStats } from "../app/Controllers/Admin/Dashboard/getDashboardStats";
import { impersonateUser } from "../app/Controllers/Admin/Users/impersonateUserAction";
import { getAdminTransactions } from "../app/Controllers/Admin/Transactions/getAdminTransactions";
import { refundTransaction } from "../app/Controllers/Admin/Transactions/refundTransactionAction";

const AdminRoutes: Router = Router();

AdminRoutes.get("/dashboard/stats", OnlyAdmins, getDashboardStats);
AdminRoutes.post(
  "/users/impersonate/:id",
  OnlyAdmins,
  validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }),
  impersonateUser
);
AdminRoutes.get("/transactions", OnlyAdmins, getAdminTransactions);
AdminRoutes.post(
  "/transactions/:id/refund",
  OnlyAdmins,
  validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }),
  refundTransaction
);

export default AdminRoutes;
