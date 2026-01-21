import { Router } from "express";
import { Auth, validateZod } from "../app/Middlewares";
import { ConnectionController } from "../app/Controllers/Connections";
import { z } from "zod";
import { objectId } from "../app/Validation/requestSchemas";

const ConnectionRoutes: Router = Router();
const followSchema = z.object({ followingTo: objectId }).strict();

ConnectionRoutes.post(
  "/follow",
  Auth,
  validateZod({ body: followSchema }),
  ConnectionController.toggleFollow
);


export default ConnectionRoutes;
