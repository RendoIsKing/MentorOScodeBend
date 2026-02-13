// @ts-nocheck - legacy passport strategy; types not in package.json
import { Strategy as LocalStrategy, IStrategyOptions } from "passport-local";
import { supabaseAdmin } from "../../lib/supabase";

/**
 * Passport local strategy — uses Supabase Auth for credential verification.
 *
 * This is kept for backward compatibility with any routes still using
 * passport.authenticate('local'). New code should use Supabase Auth directly.
 */
const options: IStrategyOptions = {
  usernameField: "email",
  passwordField: "password",
  session: false,
};

export default new LocalStrategy(options, async (email, password, done) => {
  try {
    // Use Supabase Auth to verify credentials
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return done(null, false, { message: "Login credentials error" });
    }

    // Look up user in our users table
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("auth_id", data.user.id)
      .single();

    if (userError || !user) {
      return done(null, false, { message: "Login credentials error" });
    }

    // Map to legacy shape for passport
    const legacyUser = {
      _id: user.id,
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
      phoneNumber: user.phone_number,
      country: user.dial_code,
      dialCode: user.dial_code,
      photoId: user.photo_id,
      isActive: user.is_active,
      isVerified: user.is_verified,
      isDeleted: user.is_deleted,
    };

    return done(null, legacyUser, { message: "User found" });
  } catch (e) {
    return done(null, false, { message: e });
  }
});
