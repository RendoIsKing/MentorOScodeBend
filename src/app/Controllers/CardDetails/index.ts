import { Request, Response } from "express";
import { getCardDetails } from "./Actions/getCardDetails";
import { listAllCardsOfUser } from "./Actions/listCardOfUser";
import { setDefaultCard } from "./Actions/setCardtoDefault";
import { deleteCard } from "./Actions/deleteCard";

export class CardDetailsController {
  // To add card details into db by extracting from token, token is generated from frontend side.
  static getCardDetails = async (req: Request, res: Response) => {
    return getCardDetails(req, res);
  };

  static listAllCardsOfUser = async (req: Request, res:Response) => {
    return listAllCardsOfUser(req, res);
  }

  static setDefaultCard = async ( req: Request, res: Response) => {
    return setDefaultCard(req, res);
  }

  static deleteCard = async ( req: Request, res: Response) => {
    return deleteCard(req, res);
  }
}
