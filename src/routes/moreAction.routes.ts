import { Router } from "express";
import { Auth, OnlyAdmins, validateZod } from "../app/Middlewares";
import { MoreActionsController } from "../app/Controllers/MoreUserActions";
import { z } from "zod";
import { nonEmptyString, objectIdParam, objectId } from "../app/Validation/requestSchemas";
import { userActionType } from "../types/enums/userActionTypeEnum";
import { ReasonEnum } from "../types/enums/reportReasonEnum";

const moreActionRoutes: Router = Router();
const moreActionSchema = z.object({
  actionToUser: objectId.optional(),
  actionOnPost: objectId.optional(),
  actionType: z.nativeEnum(userActionType),
  reason: z.nativeEnum(ReasonEnum).optional(),
}).strict();

const userQuerySchema = z.object({
  query: nonEmptyString,
}).strict();

const updateReportSchema = z.object({
  reportStatus: nonEmptyString,
}).strict();

moreActionRoutes.post("/", Auth, validateZod({ body: moreActionSchema }), MoreActionsController.notInterested);
moreActionRoutes.post("/query", Auth, validateZod({ body: userQuerySchema }), MoreActionsController.postUserQuery);
moreActionRoutes.get(
  "/query",
//   OnlyAdmins,
  MoreActionsController.getUserQueries
);
moreActionRoutes.post(
  "/update-report/:id",
  OnlyAdmins,
  validateZod({ params: objectIdParam("id"), body: updateReportSchema }),
  MoreActionsController.updateUserReport
);

export default moreActionRoutes;
