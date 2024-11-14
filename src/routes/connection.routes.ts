import { Router } from "express";
import { Auth } from "../app/Middlewares";
import { ConnectionController } from "../app/Controllers/Connections";

const ConnectionRoutes: Router = Router();

ConnectionRoutes.post(
  "/follow",
  Auth,
  ConnectionController.toggleFollow
);


export default ConnectionRoutes;
