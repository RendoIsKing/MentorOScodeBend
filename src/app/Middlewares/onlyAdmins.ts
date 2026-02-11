import { Request, Response, NextFunction } from 'express';

import { User } from '../Models/User';
import { verifyToken, TokenExpiredError } from '../../utils/jwt';

/**
 * Middleware that authenticates the request AND verifies the user has the 'admin' role.
 *
 * Token extraction mirrors the Auth middleware: Bearer header first, then
 * manual cookie parsing from req.headers.cookie (no cookie-parser needed).
 */
export default async function OnlyAdmins(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Extract token — Bearer header first
    const authHeader = req.headers.authorization;
    let token: string | undefined = undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length);
    }

    // 2. Fallback: parse auth_token cookie from raw header (no cookie-parser)
    if (!token && typeof req.headers.cookie === 'string') {
      const match = req.headers.cookie
        .split(';')
        .map(s => s.trim())
        .find(c => c.startsWith('auth_token='));
      if (match) {
        const raw = match.split('=').slice(1).join('=');
        try { token = decodeURIComponent(raw); } catch { token = raw; }
        if (token && token.includes(' ')) token = token.replace(/\s/g, '+');
      }
    }

    if (!token) {
      return res.status(401).json({ error: { message: 'Invalid Token. Access Denied!' } });
    }

    // 3. Verify & decode
    let payload: any;
    try {
      payload = verifyToken(token);
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        return res.status(401).json({ error: { message: 'Token expired', code: 'TOKEN_EXPIRED' } });
      }
      return res.status(401).json({ error: { message: 'Invalid Token. Access Denied!' } });
    }

    // Reject refresh tokens used as access tokens
    if (payload?.type === 'refresh') {
      return res.status(401).json({ error: { message: 'Invalid Token. Access Denied!', code: 'INVALID_TOKEN_TYPE' } });
    }

    if (!payload?.id) {
      return res.status(401).json({ error: { message: 'Invalid Token. Access Denied!' } });
    }

    // 4. Look up the real user from DB (fresh role check)
    const dbUser = await User.findById(payload.id);
    if (!dbUser) return res.status(401).json({ error: { message: 'User not found' } });
    if (dbUser.isDeleted) return res.status(401).json({ error: { message: 'User is deleted. Please contact admin!' } });
    if (!dbUser.isActive) return res.status(401).json({ error: { message: 'User is not active. Please contact admin!' } });

    // 5. Admin gate
    if (dbUser.role !== 'admin') {
      return res.status(403).json({ error: { message: "You don't have access to this resource!" } });
    }

    // @ts-ignore
    req.user = dbUser;
    return next();
  } catch (e) {
    return res.status(500).json({ error: { message: 'Something went wrong' } });
  }
}
