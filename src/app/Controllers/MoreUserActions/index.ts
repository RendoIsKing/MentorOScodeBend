import { Request, Response } from "express";
import { notInterested } from "./Actions/notInterested";
import { postUserQuery } from "./Actions/postUserQuery";
import { getUserQueries } from "./Actions/getAllUserQuery";
import { updateUserReport } from "./Actions/updateUserReport";

export class MoreActionsController {
  static notInterested = async (req: Request, res: Response) => {
    return notInterested(req, res);
  };

  static postUserQuery = async (req: Request, res: Response) => {
    return postUserQuery(req, res);
  };

  static getUserQueries = async (req: Request, res: Response) => {
    return getUserQueries(req, res);
  };
  static updateUserReport = async (req: Request, res: Response) => {
    return updateUserReport(req, res);
  };
}
