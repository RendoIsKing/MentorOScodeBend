import { Request, Response } from "express";
import { toggleFollow } from "./Actions/ToggleFollowAction";


export class ConnectionController {
  static toggleFollow = async (req: Request, res: Response) => {
    return toggleFollow(req, res);
  };




}
