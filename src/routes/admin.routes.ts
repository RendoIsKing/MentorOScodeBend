import { Router } from "express";
import OnlyAdmins from "../app/Middlewares/onlyAdmins";
import { getDashboardStats } from "../app/Controllers/Admin/Dashboard/getDashboardStats";

const AdminRoutes: Router = Router();

AdminRoutes.get("/dashboard/stats", OnlyAdmins, getDashboardStats);

export default AdminRoutes;
