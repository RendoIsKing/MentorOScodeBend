import { Router } from "express";

import { ModuleController } from "../app/Controllers/";
import { validateZod } from "../app/Middlewares";
import { z } from "zod";
import { nonEmptyString, objectIdParam } from "../app/Validation/requestSchemas";

const moduleRoutes: Router = Router();
const moduleSchema = z.object({ title: nonEmptyString }).strict();

moduleRoutes.post("/", validateZod({ body: moduleSchema }), ModuleController.create);
moduleRoutes.get("/", ModuleController.index);
moduleRoutes.get("/:id", ModuleController.show);
moduleRoutes.put("/:id", validateZod({ params: objectIdParam("id"), body: moduleSchema }), ModuleController.update);
moduleRoutes.delete("/:id", validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), ModuleController.destroy);

export default moduleRoutes;
