import { Router } from "express";
import { z } from "zod";
import OnlyAdmins from "../app/Middlewares/onlyAdmins";
import { validateZod } from "../app/Middlewares/validateZod";
import { objectIdParam } from "../app/Validation/requestSchemas";
import { getDashboardStats } from "../app/Controllers/Admin/Dashboard/getDashboardStats";
import { impersonateUser } from "../app/Controllers/Admin/Users/impersonateUserAction";
import { getAdminTransactions } from "../app/Controllers/Admin/Transactions/getAdminTransactions";
import { refundTransaction } from "../app/Controllers/Admin/Transactions/refundTransactionAction";
import { getInterests } from "../app/Controllers/Admin/Interests/getInterestsAction";
import { deleteInterest } from "../app/Controllers/Admin/Interests/deleteInterestAction";
import { getEntitledUsers } from "../app/Controllers/Admin/Entitlements/getEntitledUsersAction";
import { grantEntitlement } from "../app/Controllers/Admin/Entitlements/grantEntitlementAction";
import { revokeEntitlement } from "../app/Controllers/Admin/Entitlements/revokeEntitlementAction";
import { getReports } from "../app/Controllers/Admin/Problems/getReportsAction";
import { resolveReport } from "../app/Controllers/Admin/Problems/resolveReportAction";

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
AdminRoutes.get("/interests", OnlyAdmins, getInterests);
AdminRoutes.post(
  "/interests/delete",
  OnlyAdmins,
  validateZod({ body: z.object({ tagName: z.string().min(1) }) }),
  deleteInterest
);
AdminRoutes.get("/entitlements", OnlyAdmins, getEntitledUsers);
AdminRoutes.post(
  "/entitlements/grant",
  OnlyAdmins,
  validateZod({
    body: z.object({
      email: z.string().email(),
      role: z.enum(["mentor", "verified"]),
    }),
  }),
  grantEntitlement
);
AdminRoutes.post(
  "/entitlements/:id/revoke",
  OnlyAdmins,
  validateZod({
    params: objectIdParam("id"),
    body: z.object({ role: z.enum(["mentor", "verified"]) }),
  }),
  revokeEntitlement
);
AdminRoutes.get("/problems", OnlyAdmins, getReports);
AdminRoutes.post(
  "/problems/:id/resolve",
  OnlyAdmins,
  validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }),
  resolveReport
);

export default AdminRoutes;
