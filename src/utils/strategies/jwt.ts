import {
  Strategy as JWTStrategy,
  ExtractJwt,
  StrategyOptions,
} from "passport-jwt";

import { UserInterface } from "../../types/UserInterface";

/**
 * Passport JWT strategy — kept for backward compatibility.
 *
 * New auth uses Supabase Auth (see Middlewares/auth.ts).
 * This strategy is only loaded if JWT_SECRET is available.
 */
const secret = process.env.APP_SECRET || process.env.JWT_SECRET || "supabase-fallback-not-used";

const cookieExtractor = (req: any) => {
  if (!req) return null;
  const cookieToken = req?.cookies?.auth_token;
  if (cookieToken) return cookieToken;
  return null;
};

const options: StrategyOptions = {
  secretOrKey: secret,
  jwtFromRequest: ExtractJwt.fromExtractors([
    ExtractJwt.fromAuthHeaderAsBearerToken(),
    cookieExtractor,
  ]),
};

export default new JWTStrategy(options, (payload: UserInterface, done) => {
  try {
    if (!payload) {
      return done(null, false);
    }
    return done(null, payload);
  } catch (error) {
    return done(error, false);
  }
});
