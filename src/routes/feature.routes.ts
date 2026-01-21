import { Router } from "express";
import { FeatureController } from "../app/Controllers/Features";
import { Auth, OnlyAdmins, validateZod } from "../app/Middlewares";
import { requireEntitlement } from '../app/Middlewares/requireEntitlement';
import { z } from "zod";
import { nonEmptyString } from "../app/Validation/requestSchemas";

const feature: Router = Router();
const createFeatureSchema = z.object({
  feature: nonEmptyString,
}).strict();

feature.post("/", OnlyAdmins, validateZod({ body: createFeatureSchema }), FeatureController.createFeature);
// feature.post("/product-feat/:id", FeatureController.addFeatureToProduct);
// Make feature list public to prevent 403 blocking plan creation UI
feature.get("/", FeatureController.getAllFeaturesActions);

// Simple entitlement-protected probe used by FE smoke to confirm gating works
feature.get('/protected-check', Auth as any, requireEntitlement as any, (req, res)=>{
  return res.json({ ok: true });
});

export default feature;
