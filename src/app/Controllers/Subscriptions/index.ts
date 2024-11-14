import { Request, Response } from "express";
import { createSubscription } from "./Actions/createSubscription";
import { createOneTimeSubscription } from "./Actions/createOneTimeSubscription";
import { provideTipToCreator } from "./Actions/provideTip";

export class SubscriptionController {
  static createSubscription = (req: Request, res: Response) => {
    createSubscription(req, res);
  };
  static createOneTimePayment = (req: Request, res: Response) => {
    createOneTimeSubscription(req, res);
  };

  static provideTipToCreator = (req: Request, res: Response) => {
    provideTipToCreator(req, res);
  };
}
