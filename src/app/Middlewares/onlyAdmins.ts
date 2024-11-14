import { Request, Response, NextFunction } from 'express';
import passport from 'passport';

import { UserInterface } from '../../types/UserInterface';

export default function OnlyAdmins(req: Request, res: Response, next: NextFunction) {
  return passport.authenticate('jwt', { session: false }, (err: any, payload: UserInterface) => {
    if (err) {
      return res.status(500).json({ error: { message: 'Something went wrong' } });
    }

    if (!payload) {
      return res.status(401).json({ error: { message: 'Invalid Token. Access Denied!' } });
    }
    
    if(payload.role !== 'admin') {
      return res.status(401).json({ error: { message: 'You dont\'t have access to this resource.!' } });
    }

    req.user = payload;

    return next();

  })(req, res, next)
}
