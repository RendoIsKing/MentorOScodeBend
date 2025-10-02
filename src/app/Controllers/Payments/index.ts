import { Request, Response } from "express";
import { createSessionAction } from "./Actions/createSessionAction";

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
}

export default PaymentsController;
