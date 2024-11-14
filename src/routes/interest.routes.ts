import { Router } from "express";
import {  Auth, OnlyAdmins } from "../app/Middlewares";
import { InterestController } from "../app/Controllers/Interests";

const interest: Router = Router();

interest.post("/", OnlyAdmins, InterestController.createInterest);
interest.post("/user", Auth, InterestController.postInterest);
interest.get('/', Auth, InterestController.getAllInterest)
interest.delete("/:id", OnlyAdmins, InterestController.deleteInterest);

interest.post("/update/:id", OnlyAdmins, InterestController.updateInterest);

export default interest;
