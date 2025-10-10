import {
  Strategy as JWTStrategy,
  ExtractJwt,
  StrategyOptions,
} from "passport-jwt";

import { UserInterface } from "../../types/UserInterface";

const options: StrategyOptions = {
  secretOrKey: process.env.APP_SECRET || process.env.JWT_SECRET || 'dev_session_secret_change_me',
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
