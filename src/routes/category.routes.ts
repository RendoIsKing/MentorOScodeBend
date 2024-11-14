import {Router} from "express";

import {CategoryController} from "../app/Controllers/";
import {OnlyAdmins} from "../app/Middlewares";

const category: Router = Router();


category.get("/", CategoryController.index);
category.get("/:id", CategoryController.show);
category.post("/", OnlyAdmins, CategoryController.create);
category.put("/:id", OnlyAdmins,  CategoryController.update);
category.delete("/:id", OnlyAdmins, CategoryController.destroy);
category.post("/sub-category", OnlyAdmins, CategoryController.createSubCategory);
export default category;
