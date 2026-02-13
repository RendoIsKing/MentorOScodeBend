import { Request, Response, NextFunction } from "express";
import Auth from "./auth";

/**
 * Middleware that authenticates the request AND verifies the user has the 'admin' role.
 *
 * Delegates to the main Auth middleware first, then checks the role.
 */
export default async function OnlyAdmins(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // First, authenticate using the standard auth middleware
  Auth(req, res, (err?: any) => {
    if (err) return next(err);

    const user = (req as any).user;
    if (!user) {
      return res
        .status(401)
        .json({ error: { message: "Invalid Token. Access Denied!" } });
    }

    // Admin gate
    if (user.role !== "admin") {
      return res
        .status(403)
        .json({ error: { message: "You don't have access to this resource!" } });
    }

    return next();
  });
}
