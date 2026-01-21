import { Router } from "express";
import { OnlyAdmins, validateZod } from "../app/Middlewares";
import { SupportController } from "../app/Controllers/Support";
import { z } from "zod";

const SupportRoutes: Router = Router();
const createFaqSchema = z.object({
  topics: z.array(z.any()),
  isDeleted: z.boolean().optional(),
  deletedAt: z.string().optional(),
}).strict();
SupportRoutes.get("/faq", SupportController.getFAQ);
SupportRoutes.post("/faq", OnlyAdmins, validateZod({ body: createFaqSchema }), SupportController.createFAQ);
export default SupportRoutes;
