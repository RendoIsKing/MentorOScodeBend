import { Router } from "express";

import { ModuleController } from "../app/Controllers/";

const moduleRoutes: Router = Router();

moduleRoutes.post("/", ModuleController.create);
moduleRoutes.get("/", ModuleController.index);
moduleRoutes.get("/:id", ModuleController.show);
moduleRoutes.put("/:id", ModuleController.update);
moduleRoutes.delete("/:id", ModuleController.destroy);

export default moduleRoutes;
