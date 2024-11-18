import { Request, Response } from "express";
import { processUserData } from "./Actions/processUserData";
import { downloadUserData } from "./Actions/downloadUserData";
import { getUserData } from "./Actions/getUserData";

export class UserDataController {
  static processUserData = (req: Request, res: Response) => {
    processUserData(req, res);
  };

  static downloadUserData = (req: Request, res: Response) => {
    downloadUserData(req, res);
  };

  static getUserData = (req: Request, res: Response) => {
    getUserData(req, res);
  };
}
