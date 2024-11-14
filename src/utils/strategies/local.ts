import { Strategy as LocalStrategy, IStrategyOptions } from "passport-local";
import { compareSync } from "bcryptjs";

import { User } from "../../app/Models/User";

const options: IStrategyOptions = {
  usernameField: "email",
  passwordField: "password",
  session: false,
};
export default new LocalStrategy(options, async (email, password, done) => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return done(null, false, { message: "Login credentials error" });
    }

    if (!compareSync(password, user.password)) {
      return done(null, false, { message: "Login credentials error" });
    }

    user.lastLogin = new Date(Date.now());
    await user.save();

    return done(null, user, { message: "User found" });
  } catch (e) {
    return done(null, false, { message: e });
  }
});
