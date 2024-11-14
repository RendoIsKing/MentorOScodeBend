import { Router } from "express";
import { Auth, OnlyAdmins } from "../app/Middlewares";
import { MoreActionsController } from "../app/Controllers/MoreUserActions";

const moreActionRoutes: Router = Router();

moreActionRoutes.post("/", Auth, MoreActionsController.notInterested);
moreActionRoutes.post("/query", Auth, MoreActionsController.postUserQuery);
moreActionRoutes.get(
  "/query",
//   OnlyAdmins,
  MoreActionsController.getUserQueries
);
moreActionRoutes.post(
  "/update-report/:id",
  OnlyAdmins,
  MoreActionsController.updateUserReport
);

export default moreActionRoutes;
