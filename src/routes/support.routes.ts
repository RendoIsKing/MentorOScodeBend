import { Router } from "express";
import { OnlyAdmins } from "../app/Middlewares";
import { SupportController } from "../app/Controllers/Support";

const SupportRoutes: Router = Router();
SupportRoutes.get("/faq", SupportController.getFAQ);
SupportRoutes.post("/faq", OnlyAdmins, SupportController.createFAQ);
export default SupportRoutes;
