import { Request, Response } from "express";
import { getOwnTransactions } from "./Actions/GetTransactionsofUser";
import { getAllTransactions } from "./Actions/getAllTransactions";

export class TransactionController {
  static getOwnTransactions = (req: Request, res: Response) => {
    getOwnTransactions(req, res);
  };

  static getAllTransactions = (req: Request, res:Response) => {
    getAllTransactions(req, res);
  }

 

}
