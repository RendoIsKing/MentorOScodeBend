import passport from "passport";

import { Request, Response, NextFunction } from "express";

import { UserInterface } from "../../types/UserInterface";
import { User } from "../Models/User";

export default async function Auth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Support session-based auth first
    // @ts-ignore - session is provided by express-session
    const sessionUser = req.session?.user;
    if (sessionUser?.id) {
      const user = await User.findById(sessionUser.id);
      if (!user) {
        return res.status(401).json({ error: { message: "User not found" } });
      }
      if (user.isDeleted) {
        return res
          .status(401)
          .json({ error: { message: "User is deleted.Please contact admin!" } });
      }
      if (!user.isActive || !user.isVerified) {
        return res.status(401).json({
          error: { message: "User is not verified or not active.Please contact admin!" },
        });
      }
      // @ts-ignore
      req.user = user;
      return next();
    }

    // Fallback to JWT passport strategy
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
          return res
            .status(401)
            .json({ error: { message: "Invalid Token. Access Denied!" } });
        }
        if ((payload as any).isDeleted) {
          return res.status(401).json({
            error: { message: "User is deleted.Please contact admin!" },
          });
        }
        if (!(payload as any).isActive || !(payload as any).isVerified) {
          return res.status(401).json({
            error: {
              message:
                "User is not verified or not active.Please contact admin!",
            },
          });
        }
        const dbUser = await User.findById((payload as any).id);
        if (!dbUser) {
          return res.status(401).json({ error: { message: "User not found" } });
        }
        // @ts-ignore
        req.user = dbUser;
        return next();
      }
    )(req, res, next);
  } catch (e) {
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
}
