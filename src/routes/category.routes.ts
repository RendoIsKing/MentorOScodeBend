import {Router} from "express";

import {CategoryController} from "../app/Controllers/";
import {OnlyAdmins, validateZod} from "../app/Middlewares";
import { z } from "zod";
import { nonEmptyString, objectId, objectIdParam } from "../app/Validation/requestSchemas";

const category: Router = Router();

const createCategorySchema = z.object({
  title: nonEmptyString,
  moduleId: objectId,
}).strict();

const updateCategorySchema = z.object({
  title: nonEmptyString.optional(),
  moduleId: objectId.optional(),
}).strict();

const createSubCategorySchema = z.object({
  title: nonEmptyString,
  categoryId: objectId,
}).strict();


category.get("/", CategoryController.index);
category.get("/:id", CategoryController.show);
category.post("/", OnlyAdmins, validateZod({ body: createCategorySchema }), CategoryController.create);
category.put("/:id", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: updateCategorySchema }), CategoryController.update);
category.delete("/:id", OnlyAdmins, validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), CategoryController.destroy);
category.post("/sub-category", OnlyAdmins, validateZod({ body: createSubCategorySchema }), CategoryController.createSubCategory);
export default category;
