import { Request, Response } from "express";
import { createInterest } from "./Actions/createInterestAction";
import { postInterest } from "./Actions/postInterestByUserAction";
import { getAllInterest } from "./Actions/getAllInterestAction";
import { deleteInterest } from "./Actions/deleteInterestAction";
import { updateInterest } from "./Actions/updateInterestAction";


export class InterestController {
  static createInterest = async (req: Request, res: Response) => {
    return createInterest(req, res);
  };

  static postInterest = async (req: Request, res: Response) => {
    return postInterest(req, res);
  };

  static getAllInterest = async ( req: Request, res: Response) => {
    return getAllInterest(req, res);

  }

  static deleteInterest = async ( req: Request, res: Response ) => {
    return deleteInterest(req, res);
  }

  static updateInterest = async (req: Request, res:Response) => {
    return updateInterest(req,res);
  }






}
