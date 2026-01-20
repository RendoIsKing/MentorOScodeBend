import passport from "passport";

import { Request, Response, NextFunction } from "express";

import { UserInterface } from "../../types/UserInterface";
import { User } from "../Models/User";
import jwt from 'jsonwebtoken';

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

    // Fallback 1: Try Bearer header
    const authHeader = req.headers.authorization;
    let token: string | undefined = undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length);
    }
    // Fallback 2: Try auth_token cookie without introducing cookie-parser
    if (!token && typeof req.headers.cookie === 'string') {
      const match = req.headers.cookie.split(';').map(s=>s.trim()).find(c=>c.startsWith('auth_token='));
      if (match) {
        const raw = match.split('=').slice(1).join('=');
        try { token = decodeURIComponent(raw); } catch { token = raw; }
        // Some proxies mutate '+' to spaces; fix common case
        if (token && token.includes(' ')) token = token.replace(/\s/g, '+');
      }
    }

    if (token) {
      try {
        const primary = process.env.APP_SECRET || process.env.JWT_SECRET;
        if (!primary) {
          return res.status(500).json({ error: { message: "APP_SECRET or JWT_SECRET missing" } });
        }
        let payload: any;
        try { payload = jwt.verify(token, primary); } catch (e) {
          // If verification fails, fall through to passport JWT
        }
        if (!payload?.id) return res.status(401).json({ error: { message: 'Invalid Token. Access Denied!' } });
        const dbUser = await User.findById(payload.id);
        if (!dbUser) return res.status(401).json({ error: { message: 'User not found' } });
        if (dbUser.isDeleted) return res.status(401).json({ error: { message: 'User is deleted.Please contact admin!' } });
        if (!dbUser.isActive || !dbUser.isVerified) return res.status(401).json({ error: { message: 'User is not verified or not active.Please contact admin!' } });
        // @ts-ignore
        req.user = dbUser;
        return next();
      } catch (e) {
        // fall through to passport jwt below
      }
    }

    // Last resort: passport JWT (Bearer only)
    return passport.authenticate(
      "jwt",
      { session: false },
      async (err: any, payload: UserInterface) => {
        if (err) {
          return res.status(500).json({ error: { message: "Something went wrong" } });
        }
        if (!payload) {
          return res.status(401).json({ error: { message: "Invalid Token. Access Denied!" } });
        }
        const dbUser = await User.findById((payload as any).id);
        if (!dbUser) return res.status(401).json({ error: { message: "User not found" } });
        if (dbUser.isDeleted) return res.status(401).json({ error: { message: "User is deleted.Please contact admin!" } });
        if (!dbUser.isActive || !dbUser.isVerified) return res.status(401).json({ error: { message: "User is not verified or not active.Please contact admin!" } });
        // @ts-ignore
        req.user = dbUser;
        return next();
      }
    )(req, res, next);
  } catch (e) {
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
}
