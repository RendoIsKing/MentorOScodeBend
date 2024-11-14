import { Request, Response } from "express";
import { postSubscriptionPlan } from "./Actions/createSubscriptionPlanAction";
import { getSubscriptionPlan } from "./Actions/getSubscriptionPlanAction";
import { updateSubscriptionPlan } from "./Actions/updateSubscriptionPlanAction";
import { softDeleteSubscriptionPlan } from "./Actions/deleteSubscriptionPlanAction";
import createProduct from "./Actions/createProduct";

export class SubscriptionPlanController {
  static createPlan = (req: Request, res: Response) => {
    postSubscriptionPlan(req, res);
  };

  static createProduct  = (req: Request, res: Response) => {
    createProduct(req, res);
  }

  static getSubscriptionPlan = (req :Request, res: Response) => {
    getSubscriptionPlan(req, res);
  };

  static updateSubscriptionPlan = (req: Request, res: Response) => {
    updateSubscriptionPlan(req, res);
  };

  static softDeleteSubscriptionPlan = (req: Request, res:Response) => {
    softDeleteSubscriptionPlan(req, res);
  }

}
