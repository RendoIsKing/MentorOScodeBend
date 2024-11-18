import { Response, Request } from "express";
// import { addFeatureToProduct } from "./Actions/associateFeatureToProduct";
import { getAllFeaturesActions } from "./Actions/getFeaturesAction";
import { createFeature } from "./Actions/createFeatureAction";

export class FeatureController {
    static createFeature(req: Request, res: Response) {
      createFeature(req, res);
    }

  //   static addFeatureToProduct(req:Request, res: Response) {
  //     addFeatureToProduct(req, res);
  //   }

  static getAllFeaturesActions(req: Request, res: Response) {
    getAllFeaturesActions(req, res);
  }
}
