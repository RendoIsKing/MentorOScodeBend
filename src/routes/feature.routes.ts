import { Router } from "express";
import { FeatureController } from "../app/Controllers/Features";
import { Auth, OnlyAdmins } from "../app/Middlewares";
import { requireEntitlement } from '../app/Middlewares/requireEntitlement';

const feature: Router = Router();

feature.post("/", OnlyAdmins, FeatureController.createFeature);
// feature.post("/product-feat/:id", FeatureController.addFeatureToProduct);
// Make feature list public to prevent 403 blocking plan creation UI
feature.get("/", FeatureController.getAllFeaturesActions);

// Simple entitlement-protected probe used by FE smoke to confirm gating works
feature.get('/protected-check', Auth as any, requireEntitlement as any, (req, res)=>{
  return res.json({ ok: true });
});

export default feature;
