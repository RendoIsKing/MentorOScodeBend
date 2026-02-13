import { Request, Response, NextFunction } from "express";
import { findById, Tables } from "../../lib/db";

export async function requireEntitlement(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = (req as any).user;
    if (!user)
      return res.status(401).json({ error: { message: "Unauthorized" } });

    // Check status from req.user (set by Auth middleware)
    if (user.status === "SUBSCRIBED") return next();

    // Re-fetch from DB to account for status changes during session
    try {
      const userId = user.id || user._id;
      if (userId) {
        const fresh = await findById(Tables.USERS, userId, "status");
        if (fresh?.status === "SUBSCRIBED") return next();
      }
    } catch {}

    return res
      .status(403)
      .json({ error: { message: "Subscription required" } });
  } catch {
    return res.status(500).json({ error: { message: "Guard failed" } });
  }
}
