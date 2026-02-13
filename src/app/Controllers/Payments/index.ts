import { Request, Response } from "express";
import { createSessionAction } from "./Actions/createSessionAction";
import { createCoachMajenCheckout } from "./Actions/createCoachMajenCheckout";
import { verifyCoachMajenPayment } from "./Actions/verifyCoachMajenPayment";

class PaymentsController {
  static createSession(req: Request, res: Response) {
    return createSessionAction(req, res);
  }
  static async status(req: Request, res: Response) {
    try {
      // @ts-ignore
      const user = req.user;
      if (!user) return res.status(401).json({ error: { message: 'Unauthorized' } });
      const active = String((user as any).status || '').toUpperCase() === 'SUBSCRIBED';
      return res.json({ active });
    } catch (e) {
      return res.status(500).json({ error: { message: 'status failed' } });
    }
  }
  static coachMajenCheckout(req: Request, res: Response) {
    return createCoachMajenCheckout(req, res);
  }
  static coachMajenVerify(req: Request, res: Response) {
    return verifyCoachMajenPayment(req, res);
  }
}

export default PaymentsController;
