import passport from "passport";

import { Request, Response, NextFunction } from "express";

import { UserInterface } from "../../types/UserInterface";
import { User } from "../Models/User";

export default function Auth(req: Request, res: Response, next: NextFunction) {
  return passport.authenticate(
    "jwt",
    { session: false },
    async (err: any, payload: UserInterface) => {
      if (err) {
        return res
          .status(500)
          .json({ error: { message: "Something went wrong" } });
      }

    if (!payload) {
      return res.status(401).json({error: {message: 'Invalid Token. Access Denied!'}});
    } 
    if(payload.isDeleted) {
      return res.status(401).json({ error: { message: 'User is deleted.Please contact admin!' } });
    }
    if(!payload.isActive ||!payload.isVerified) {
      return res.status(401).json({ error: { message: 'User is not verified or not active.Please contact admin!' } });
    }
    req.user = await User.findById(payload.id)||undefined;
    return next();

  })(req, res, next)
}
