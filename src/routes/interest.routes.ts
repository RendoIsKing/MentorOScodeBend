import { Router } from "express";
import { Auth, OnlyAdmins, validateZod } from "../app/Middlewares";
import { InterestController } from "../app/Controllers/Interests";
import { z } from "zod";
import { objectIdParam, objectId } from "../app/Validation/requestSchemas";

const interest: Router = Router();

const interestSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  addedBy: objectId,
  isAvailable: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  deletedAt: z.string().optional(),
}).strict();

const updateInterestSchema = z.object({
  isAvailable: z.boolean().optional(),
}).strict();

interest.post("/", OnlyAdmins, validateZod({ body: interestSchema }), InterestController.createInterest);
interest.post("/user", Auth, validateZod({ body: interestSchema }), InterestController.postInterest);
interest.get('/', Auth, InterestController.getAllInterest)
interest.delete("/:id", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), InterestController.deleteInterest);

interest.post("/update/:id", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: updateInterestSchema }), InterestController.updateInterest);

export default interest;
