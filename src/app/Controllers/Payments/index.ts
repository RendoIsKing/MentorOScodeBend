import { Request, Response } from "express";
import { createSessionAction } from "./Actions/createSessionAction";

class PaymentsController {
  static createSession(req: Request, res: Response) {
    return createSessionAction(req, res);
  }
}

export default PaymentsController;
