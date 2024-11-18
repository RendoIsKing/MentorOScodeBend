import { Router } from "express";
import { FeatureController } from "../app/Controllers/Features";
import { Auth, OnlyAdmins } from "../app/Middlewares";

const feature: Router = Router();

feature.post("/", OnlyAdmins, FeatureController.createFeature);
// feature.post("/product-feat/:id", FeatureController.addFeatureToProduct);
feature.get("/", Auth, FeatureController.getAllFeaturesActions);

export default feature;
