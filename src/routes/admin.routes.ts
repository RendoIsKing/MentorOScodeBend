import { Router } from "express";
import { z } from "zod";
import OnlyAdmins from "../app/Middlewares/onlyAdmins";
import { validateZod } from "../app/Middlewares/validateZod";
import { objectIdParam } from "../app/Validation/requestSchemas";
import { getDashboardStats } from "../app/Controllers/Admin/Dashboard/getDashboardStats";
import { impersonateUser } from "../app/Controllers/Admin/Users/impersonateUserAction";

const AdminRoutes: Router = Router();

AdminRoutes.get("/dashboard/stats", OnlyAdmins, getDashboardStats);
AdminRoutes.post(
  "/users/impersonate/:id",
  OnlyAdmins,
  validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }),
  impersonateUser
);

export default AdminRoutes;
