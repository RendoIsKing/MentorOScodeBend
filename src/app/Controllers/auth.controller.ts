import { Request, Response } from "express";
import { supabaseAdmin, supabasePublic } from "../../lib/supabase";
import { OAuth2Client } from "google-auth-library";
import { addMinutes } from "date-fns";
import otpGenerator from "../../utils/otpGenerator";
import { sendMessage } from "../../utils/Twillio/sendMessage";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCookieOptions(maxAgeMs: number): any {
  const isProd = process.env.NODE_ENV === "production";
  const sameSiteEnv = String(
    process.env.SESSION_SAMESITE || (isProd ? "none" : "lax"),
  ).toLowerCase();
  const cookieSameSite = (sameSiteEnv === "none" ? "none" : "lax") as any;
  const secureEnv = String(
    process.env.SESSION_SECURE || (isProd ? "true" : "false"),
  ).toLowerCase();
  const cookieSecure = secureEnv === "true" || secureEnv === "1";
  const cookieDomain = (process.env.SESSION_COOKIE_DOMAIN || "").trim();
  const opts: any = {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
    maxAge: maxAgeMs,
    path: "/",
  };
  if (cookieDomain) opts.domain = cookieDomain;
  return opts;
}

function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  rememberMe = true,
) {
  try {
    // Access token cookie: 1 hour (Supabase default lifetime)
    res.cookie("auth_token", accessToken, getCookieOptions(1000 * 60 * 60));
    // Refresh token cookie: 30 days if "remember me", 7 days otherwise
    const refreshMaxAge = rememberMe
      ? 1000 * 60 * 60 * 24 * 30 // 30 days
      : 1000 * 60 * 60 * 24 * 7; // 7 days
    res.cookie("refresh_token", refreshToken, getCookieOptions(refreshMaxAge));
  } catch {}
}

const getAdminEmailSet = () => {
  const raw = String(
    process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "",
  ).toLowerCase();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  );
};

/**
 * Map a postgres users row to the legacy API shape.
 */
function toUserPayload(user: any) {
  return {
    _id: user.id,
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: user.full_name,
    userName: user.user_name,
    email: user.email,
    role: user.role,
    phoneNumber: user.phone_number,
    dialCode: user.dial_code,
    photoId: user.photo_id,
    coverPhotoId: user.cover_photo_id,
    googleId: user.google_id,
    isMentor: user.is_mentor,
    isActive: user.is_active,
    isVerified: user.is_verified,
    isDeleted: user.is_deleted,
    status: user.status,
    hasPersonalInfo: user.has_personal_info,
    hasPhotoInfo: user.has_photo_info,
    hasSelectedInterest: user.has_selected_interest,
    hasConfirmedAge: user.has_confirmed_age,
    hasDocumentUploaded: user.has_document_uploaded,
    hasDocumentVerified: user.has_document_verified,
    isFreeSubscription: user.is_free_subscription,
    bio: user.bio,
    gender: user.gender,
    dob: user.dob,
    youtubeLink: user.youtube_link,
    instagramLink: user.instagram_link,
    tiktokLink: user.tiktok_link,
    facebookLink: user.facebook_link,
    websiteLink: user.website_link,
    welcomeMessage: user.welcome_message,
    notificationPreferences: user.notification_preferences,
    mentorExpertise: user.mentor_expertise,
    mentorCertifications: user.mentor_certifications,
    mentorYearsExperience: user.mentor_years_experience,
    mentorHasFreeTrial: user.mentor_has_free_trial,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

// ── Controller ───────────────────────────────────────────────────────────────

class AuthController {
  /**
   * Register a new user with email + password via Supabase Auth.
   */
  static regsiter = async (req: Request, res: Response): Promise<any> => {
    try {
      const {
        firstName,
        lastName,
        fullName,
        userName,
        gender,
        email,
        password,
        phoneNumber,
        dialCode,
      } = req.body;

      // Check if user already exists
      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id")
        .or(`email.eq.${email},complete_phone_number.eq.${dialCode}--${phoneNumber}`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        return res.status(400).json({
          data: {
            message: "User already exists with same email or phone number.",
          },
        });
      }

      // Create Supabase auth user (or recover if auth user already exists)
      let authUserId: string;
      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName || `${firstName} ${lastName}`.trim(),
          },
        });

      if (authError) {
        // If user already exists in Supabase Auth but not in public.users,
        // recover by finding the existing auth user and updating their password
        if (authError.message.includes("already been registered")) {
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
          const existingAuth = listData?.users?.find(
            (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
          );
          if (existingAuth) {
            // Update their password to the one provided
            await supabaseAdmin.auth.admin.updateUserById(existingAuth.id, { password });
            authUserId = existingAuth.id;
          } else {
            return res.status(400).json({ error: { message: authError.message } });
          }
        } else {
          console.error("[register] Supabase auth error:", authError.message);
          return res
            .status(400)
            .json({ error: { message: authError.message } });
        }
      } else {
        authUserId = authData.user.id;
      }

      // Ensure a public.users row exists (trigger may have created one, or we need to upsert)
      let { data: user } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("auth_id", authUserId)
        .maybeSingle();

      const profileData = {
        full_name: fullName || `${firstName} ${lastName}`.trim(),
        first_name: firstName,
        last_name: lastName,
        user_name: userName || null,
        gender: gender || null,
        email,
        phone_number: phoneNumber,
        dial_code: dialCode,
        complete_phone_number: dialCode && phoneNumber ? `${dialCode}--${phoneNumber}` : null,
        is_active: true,
        is_verified: true,
      };

      if (user) {
        const { data: updated, error: userError } = await supabaseAdmin
          .from("users")
          .update(profileData)
          .eq("auth_id", authUserId)
          .select("*")
          .single();
        if (userError) console.error("[register] user update error:", userError.message);
        user = updated || user;
      } else {
        // No trigger-created row — insert one manually
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("users")
          .insert({ ...profileData, auth_id: authUserId })
          .select("*")
          .single();
        if (insertError) console.error("[register] user insert error:", insertError.message);
        user = inserted;
      }

      // Sign in to get tokens
      const { data: session, error: signInError } =
        await supabasePublic.auth.signInWithPassword({ email, password });

      if (signInError || !session.session) {
        // User created but can't sign in — return success with user data
        return res.json({ data: toUserPayload(user || { id: authUserId }) });
      }

      setAuthCookies(
        res,
        session.session.access_token,
        session.session.refresh_token,
        true, // new users default to remember
      );

      return res.json({
        data: {
          ...toUserPayload(user || {}),
          token: session.session.access_token,
        },
      });
    } catch (error) {
      console.error("[register] error:", error);
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  /**
   * Email/password login via Supabase Auth.
   */
  static login = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, password } = req.body;

      // Try direct sign-in first
      let { data: session, error } =
        await supabasePublic.auth.signInWithPassword({ email, password });

      // If direct sign-in fails, the user may have registered via phone OTP
      // and the Supabase Auth email is a placeholder. Look up by email in
      // public.users and migrate their Auth credentials.
      if (error && email) {
        console.log("[login] direct sign-in failed, checking public.users for:", email);
        const { data: publicUser } = await supabaseAdmin
          .from("users")
          .select("auth_id, email, is_deleted, is_active")
          .ilike("email", email)
          .eq("is_deleted", false)
          .limit(1)
          .maybeSingle();

        if (publicUser?.auth_id) {
          console.log("[login] found public.users entry with auth_id:", publicUser.auth_id);
          // Update the Supabase Auth user's email and password to the real ones
          const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
            publicUser.auth_id,
            { email, password, email_confirm: true },
          );
          if (updateErr) {
            console.error("[login] failed to update auth user credentials:", updateErr.message);
          } else {
            // Retry sign-in with the updated credentials
            const retry = await supabasePublic.auth.signInWithPassword({ email, password });
            session = retry.data;
            error = retry.error;
            console.log("[login] retry sign-in result:", error ? error.message : "success");
          }
        }
      }

      if (error || !session?.session) {
        return res
          .status(401)
          .json({ error: { message: "Invalid login credentials" } });
      }

      // Look up user
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("auth_id", session.user.id)
        .single();

      if (!user) {
        return res.status(401).json({ error: { message: "User not found" } });
      }

      if (user.is_deleted) {
        return res
          .status(401)
          .json({ error: "User is deleted. Please contact admin" });
      }
      if (!user.is_active) {
        return res
          .status(401)
          .json({ error: "User not active. Please contact admin." });
      }

      // Auto-promote admin if email matches
      const adminEmails = getAdminEmailSet();
      if (user.email && adminEmails.has(user.email.toLowerCase()) && user.role !== "admin") {
        console.log("[login] promoting user to admin:", user.email);
        await supabaseAdmin
          .from("users")
          .update({ role: "admin" })
          .eq("id", user.id);
        user.role = "admin";
      }

      setAuthCookies(
        res,
        session.session.access_token,
        session.session.refresh_token,
        req.body.rememberMe !== false,
      );

      return res.json({
        data: {
          ...toUserPayload(user),
          token: session.session.access_token,
          refreshToken: session.session.refresh_token,
        },
      });
    } catch (error) {
      console.error("[login] error:", error);
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  /**
   * Flexible login: phone OTP or password-based (email/phone/username).
   */
  static userLogin = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, username, userName, phoneNumber, password, dialCode } =
        req.body || {};
      const effectiveUserName = userName || username;

      // ── Branch A: Phone-only (no password) → OTP flow ──
      if (!password && (phoneNumber || email || effectiveUserName)) {
        let dial = "";
        let num = "";
        if (typeof phoneNumber === "string" && phoneNumber.includes("--")) {
          const parts = phoneNumber.split("--");
          if (parts.length === 2) {
            dial = String(parts[0] || "").replace(/^\+/, "").replace(/\s+/g, "");
            num = String(parts[1] || "").replace(/\s+/g, "");
          } else if (parts.length === 3) {
            dial = String(parts[1] || "").replace(/^\+/, "").replace(/\s+/g, "");
            num = String(parts[2] || "").replace(/\s+/g, "");
          }
        } else if (phoneNumber && dialCode) {
          dial = String(dialCode || "").replace(/^\+/, "").replace(/\s+/g, "");
          num = String(phoneNumber || "").replace(/\s+/g, "");
        }
        if (!dial || !num) {
          return res
            .status(422)
            .json({ message: "dialCode and phoneNumber are required" });
        }

        // Find or create user by phone
        const completePhone = `${dial}--${num}`;
        let { data: user } = await supabaseAdmin
          .from("users")
          .select("*")
          .or(`complete_phone_number.eq.${completePhone},and(dial_code.eq.${dial},phone_number.eq.${num})`)
          .eq("is_deleted", false)
          .limit(1)
          .maybeSingle();

        if (!user) {
          // Create auth user with phone-based email placeholder
          const placeholderEmail = `phone_${dial}${num}@placeholder.local`;
          const tempPassword = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          let newAuthUserId: string;

          const { data: authData, error: authErr } =
            await supabaseAdmin.auth.admin.createUser({
              email: placeholderEmail,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { first_name: "", last_name: "" },
            });

          if (authErr) {
            // If auth user already exists, recover
            if (authErr.message.includes("already been registered")) {
              const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
              const existing = listData?.users?.find(
                (u: any) => u.email?.toLowerCase() === placeholderEmail.toLowerCase(),
              );
              if (existing) {
                newAuthUserId = existing.id;
              } else {
                console.error("[userLogin] create user error:", authErr.message);
                return res.status(500).json({ message: authErr.message });
              }
            } else {
              console.error("[userLogin] create user error:", authErr.message);
              return res.status(500).json({ message: authErr.message });
            }
          } else {
            newAuthUserId = authData.user.id;
          }

          // Check if trigger created a row, otherwise insert
          let { data: triggerRow } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("auth_id", newAuthUserId)
            .maybeSingle();

          if (triggerRow) {
            const { data: updated } = await supabaseAdmin
              .from("users")
              .update({
                email: email || null,
                dial_code: dial,
                phone_number: num,
                complete_phone_number: completePhone,
                is_active: true,
              })
              .eq("auth_id", newAuthUserId)
              .select("*")
              .single();
            user = updated || triggerRow;
          } else {
            const { data: inserted } = await supabaseAdmin
              .from("users")
              .insert({
                auth_id: newAuthUserId,
                email: email || null,
                dial_code: dial,
                phone_number: num,
                complete_phone_number: completePhone,
                is_active: true,
              })
              .select("*")
              .single();
            user = inserted;
          }
        }

        const otp = otpGenerator();
        const otpInvalidAt = addMinutes(new Date(), 10).toISOString();

        await supabaseAdmin
          .from("users")
          .update({ otp: String(otp), otp_invalid_at: otpInvalidAt })
          .eq("id", user!.id);

        try {
          await sendMessage(`${dial}--${num}`, `Your OTP is: ${otp}`);
        } catch {}

        return res.status(200).json({
          data: { _id: user!.id, dialCode: dial, phoneNumber: num, otp },
          message: "OTP sent successfully",
        });
      }

      // ── Branch B: Password login ──
      // Find user by email, username, or phone
      let userQuery = supabaseAdmin
        .from("users")
        .select("*")
        .eq("is_deleted", false);

      const orClauses: string[] = [];
      if (email) orClauses.push(`email.ilike.${email}`);
      if (effectiveUserName) orClauses.push(`user_name.ilike.${effectiveUserName}`);
      if (phoneNumber) {
        // Support "prefix--number" format from frontend (e.g. "+47--96016106")
        if (typeof phoneNumber === "string" && phoneNumber.includes("--")) {
          const parts = phoneNumber.split("--");
          const dial = String(parts[0] || "").replace(/^\+/, "").replace(/\s+/g, "");
          const num = String(parts[1] || "").replace(/\s+/g, "");
          if (dial && num) {
            orClauses.push(`complete_phone_number.eq.${dial}--${num}`);
          }
        } else if (dialCode) {
          const dial = String(dialCode).replace(/^\+/, "").replace(/\s+/g, "");
          const num = String(phoneNumber).replace(/\s+/g, "");
          orClauses.push(`complete_phone_number.eq.${dial}--${num}`);
        }
      }

      if (orClauses.length === 0) {
        return res.status(400).json({
          message: "Vennligst oppgi e-post, brukernavn eller telefonnummer.",
          code: "MISSING_IDENTIFIER",
        });
      }

      const { data: user } = await userQuery
        .or(orClauses.join(","))
        .limit(1)
        .maybeSingle();

      if (!user) {
        return res.status(404).json({
          message: "Finner ingen bruker med denne informasjonen. Sjekk at du har skrevet riktig, eller opprett en ny konto.",
          code: "USER_NOT_FOUND",
        });
      }

      // Account lockout check
      if (user?.lock_until && new Date(user.lock_until) > new Date()) {
        const remainingMin = Math.ceil(
          (new Date(user.lock_until).getTime() - Date.now()) / 60000,
        );
        return res.status(423).json({
          message: `Account is temporarily locked. Try again in ${remainingMin} minute(s).`,
          code: "ACCOUNT_LOCKED",
        });
      }

      // Determine the email to use for Supabase Auth sign-in
      let authEmail = user.email;

      // If the user has no email in public.users, try to get the Auth email
      if (!authEmail && user.auth_id) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(user.auth_id);
        authEmail = authUser?.user?.email || null;
      }

      if (!authEmail) {
        return res.status(400).json({ message: "Invalid login credentials" });
      }

      // Sign in with Supabase Auth (use public/anon client for proper JWT)
      let { data: session, error: signInError } =
        await supabasePublic.auth.signInWithPassword({
          email: authEmail,
          password,
        });

      // If sign-in fails and user was created via phone OTP, the Supabase Auth
      // credentials may not match. Sync them and retry.
      if (signInError && user.auth_id) {
        console.log("[userLogin] direct sign-in failed:", signInError.message, "for", user.user_name, "- syncing auth credentials");

        // Determine which email to use for Supabase Auth
        const syncEmail = user.email || authEmail;

        // Strategy 1: sync credentials and retry signInWithPassword
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
          user.auth_id,
          { email: syncEmail!, password, email_confirm: true },
        );
        if (!updateErr) {
          await new Promise((r) => setTimeout(r, 300));
          const retry = await supabasePublic.auth.signInWithPassword({
            email: syncEmail!,
            password,
          });
          session = retry.data;
          signInError = retry.error;
          console.log("[userLogin] retry sign-in:", signInError ? signInError.message : "success");
        } else {
          console.error("[userLogin] failed to sync auth credentials:", updateErr.message);
        }

        // Strategy 2: generateLink fallback (if signInWithPassword still fails)
        if (signInError || !session?.session) {
          console.log("[userLogin] Falling back to generateLink for:", syncEmail);
          try {
            const { data: linkData, error: linkError } =
              await supabaseAdmin.auth.admin.generateLink({
                type: "magiclink",
                email: syncEmail!,
              });
            if (!linkError && linkData?.properties?.hashed_token) {
              const { data: otpSession, error: otpError } =
                await supabasePublic.auth.verifyOtp({
                  type: "magiclink",
                  token_hash: linkData.properties.hashed_token,
                });
              if (otpSession?.session) {
                session = { user: otpSession.user!, session: otpSession.session } as typeof session;
                signInError = null;
                console.log("[userLogin] generateLink fallback succeeded");
              }
              if (otpError) console.error("[userLogin] verifyOtp failed:", otpError.message);
            }
            if (linkError) console.error("[userLogin] generateLink failed:", linkError.message);
          } catch (fallbackErr) {
            console.error("[userLogin] generateLink fallback threw:", fallbackErr);
          }
        }
      }

      if (signInError || !session?.session) {
        // Increment failed attempts
        const MAX_ATTEMPTS = 5;
        const LOCK_DURATION_MIN = 15;
        const attempts = (user.login_attempts || 0) + 1;
        const updateData: any = { login_attempts: attempts };
        if (attempts >= MAX_ATTEMPTS) {
          updateData.lock_until = addMinutes(
            new Date(),
            LOCK_DURATION_MIN,
          ).toISOString();
        }
        await supabaseAdmin
          .from("users")
          .update(updateData)
          .eq("id", user.id);

        if (attempts >= MAX_ATTEMPTS) {
          return res.status(423).json({
            message: `For mange mislykkede forsøk. Kontoen er låst i ${LOCK_DURATION_MIN} minutter.`,
            code: "ACCOUNT_LOCKED",
          });
        }
        return res.status(401).json({
          message: "Feil passord. Sjekk at du har skrevet riktig passord og prøv igjen.",
          code: "WRONG_PASSWORD",
        });
      }

      // Reset failed attempts
      if (user.login_attempts && user.login_attempts > 0) {
        await supabaseAdmin
          .from("users")
          .update({ login_attempts: 0, lock_until: null })
          .eq("id", user.id);
      }

      // Auto-promote admin
      const adminEmails = getAdminEmailSet();
      if (
        adminEmails.size > 0 &&
        adminEmails.has(String(user.email).toLowerCase()) &&
        user.role !== "admin"
      ) {
        await supabaseAdmin
          .from("users")
          .update({ role: "admin" })
          .eq("id", user.id);
        user.role = "admin";
      }

      setAuthCookies(
        res,
        session.session.access_token,
        session.session.refresh_token,
        req.body.rememberMe !== false,
      );

      return res.json({
        message: "User login successfully",
        token: session.session.access_token,
        refreshToken: session.session.refresh_token,
        user: {
          id: user.id,
          name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
          email: user.email,
          role: user.role,
          userName: user.user_name,
        },
      });
    } catch (error) {
      const msg = (error as any)?.message || String(error);
      console.error("[auth:user-login] failed", msg);
      return res.status(500).json({ message: msg });
    }
  };

  /**
   * Google OAuth login via Supabase.
   */
  static googleLogin = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      if (!clientId)
        return res.status(500).json({ message: "GOOGLE_OAUTH_CLIENT_ID missing" });

      const { idToken } = (req.body || {}) as { idToken?: string };
      if (!idToken)
        return res.status(400).json({ message: "idToken required" });

      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub || !payload.email) {
        return res.status(401).json({ message: "Invalid Google token" });
      }

      const googleId = payload.sub;
      const googleEmail = String(payload.email).toLowerCase();

      // Check if user exists by googleId or email
      let { data: user } = await supabaseAdmin
        .from("users")
        .select("*")
        .or(`google_id.eq.${googleId},email.eq.${googleEmail}`)
        .limit(1)
        .maybeSingle();

      let isNewUser = false;

      if (!user) {
        // Create Supabase auth user for Google sign-in
        const { data: authData, error: authError } =
          await supabaseAdmin.auth.admin.createUser({
            email: googleEmail,
            email_confirm: true,
            user_metadata: {
              first_name: payload.given_name || "",
              last_name: payload.family_name || "",
              full_name: payload.name || "",
              provider_id: googleId,
            },
            app_metadata: { provider: "google" },
          });

        if (authError) {
          console.error("[GoogleLogin] createUser failed:", authError.message);
          return res.status(500).json({ message: authError.message });
        }

        // Update the trigger-created row in public.users.
        // The DB trigger may take a moment to fire, so retry if needed.
        let newUser: any = null;
        for (let attempt = 0; attempt < 3 && !newUser; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 300 * attempt));
          const { data } = await supabaseAdmin
            .from("users")
            .update({
              first_name: payload.given_name || "",
              last_name: payload.family_name || "",
              full_name: payload.name || "",
              google_id: googleId,
              is_active: true,
              is_verified: true,
            })
            .eq("auth_id", authData.user.id)
            .select("*")
            .single();
          newUser = data;
        }

        if (!newUser) {
          console.error("[GoogleLogin] trigger row not found after createUser. auth_id:", authData.user.id);
        }

        user = newUser;
        isNewUser = true;
      } else if (!user.google_id) {
        // Link Google to existing user
        await supabaseAdmin
          .from("users")
          .update({ google_id: googleId })
          .eq("id", user.id);
      }

      if (!user?.user_name || String(user.user_name).trim() === "") {
        isNewUser = true;
      }

      // Generate real Supabase Auth tokens for Google users.
      let accessToken = "";
      let refreshToken = "";

      const authId = user?.auth_id;
      if (!authId) {
        console.error("[GoogleLogin] user has no auth_id – cannot generate session. user.id:", user?.id);
        return res.status(500).json({ message: "User account incomplete. Please try again." });
      }

      const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(authId);
      const authEmail = authUserData?.user?.email;

      if (!authEmail) {
        console.error("[GoogleLogin] auth user has no email. authId:", authId);
        return res.status(500).json({ message: "Auth account missing email. Please try again." });
      }

      // Strategy 1: signInWithPassword (fast path)
      const stablePw = `goo_${authId}_${process.env.SESSION_SECRET || "mentorio"}`;
      await supabaseAdmin.auth.admin.updateUserById(authId, { password: stablePw });

      const { data: session, error: signInError } = await supabasePublic.auth.signInWithPassword({
        email: authEmail,
        password: stablePw,
      });

      if (session?.session) {
        accessToken = session.session.access_token;
        refreshToken = session.session.refresh_token;
      }

      // Retry once if first attempt failed (password propagation delay)
      if (!accessToken && signInError) {
        console.warn("[GoogleLogin] signInWithPassword attempt 1 failed:", signInError.message);
        await new Promise((r) => setTimeout(r, 800));
        const { data: retrySession, error: retryError } = await supabasePublic.auth.signInWithPassword({
          email: authEmail,
          password: stablePw,
        });
        if (retrySession?.session) {
          accessToken = retrySession.session.access_token;
          refreshToken = retrySession.session.refresh_token;
        }
        if (retryError) {
          console.warn("[GoogleLogin] signInWithPassword attempt 2 failed:", retryError.message);
        }
      }

      // Strategy 2: generateLink + verifyOtp fallback
      // Works even when email+password auth is restricted or password
      // hasn't propagated yet — doesn't require a password at all.
      if (!accessToken) {
        console.log("[GoogleLogin] Falling back to generateLink for:", authEmail);
        try {
          const { data: linkData, error: linkError } =
            await supabaseAdmin.auth.admin.generateLink({
              type: "magiclink",
              email: authEmail,
            });

          if (linkError) {
            console.error("[GoogleLogin] generateLink failed:", linkError.message);
          } else if (linkData?.properties?.hashed_token) {
            const { data: otpSession, error: otpError } =
              await supabasePublic.auth.verifyOtp({
                type: "magiclink",
                token_hash: linkData.properties.hashed_token,
              });

            if (otpSession?.session) {
              accessToken = otpSession.session.access_token;
              refreshToken = otpSession.session.refresh_token;
              console.log("[GoogleLogin] generateLink fallback succeeded");
            }
            if (otpError) {
              console.error("[GoogleLogin] verifyOtp failed:", otpError.message);
            }
          }
        } catch (fallbackErr) {
          console.error("[GoogleLogin] generateLink fallback threw:", fallbackErr);
        }
      }

      if (!accessToken) {
        console.error("[GoogleLogin] All token strategies failed for user:", user?.id, "authId:", authId, "email:", authEmail);
        return res.status(500).json({ message: "Could not generate auth session. Please try again." });
      }

      const rememberMe = req.body.rememberMe !== false; // Default to true
      if (accessToken) {
        setAuthCookies(res, accessToken, refreshToken, rememberMe);
      }

      return res.json({
        token: accessToken,
        refreshToken,
        isNewUser,
        user: {
          id: user!.id,
          email: user!.email,
          name: `${user!.first_name ?? ""} ${user!.last_name ?? ""}`.trim(),
          role: user!.role,
        },
      });
    } catch (e) {
      const msg = (e as any)?.message || String(e);
      return res.status(401).json({ message: msg || "Google login failed" });
    }
  };

  /**
   * Verify OTP and issue auth tokens.
   */
  static verifyOtp = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const { id, otp } = req.body;

      if (!id || !otp) {
        return res
          .status(400)
          .json({ error: { message: "id and otp are required" } });
      }

      const { data: user, error } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !user) {
        return res
          .status(400)
          .json({ error: { message: "User not found" } });
      }

      if (
        user.otp !== String(otp) ||
        (user.otp_invalid_at && new Date() > new Date(user.otp_invalid_at))
      ) {
        return res.status(400).json({ data: { message: "otp is invalid" } });
      }

      // Mark verified
      const { data: updatedUser } = await supabaseAdmin
        .from("users")
        .update({
          is_verified: true,
          verified_at: new Date().toISOString(),
          otp: "",
        })
        .eq("id", id)
        .select("*")
        .single();

      // Generate real Supabase Auth tokens
      let accessToken = "";
      let refreshToken = "";

      if (updatedUser?.auth_id) {
        // Get the auth user's actual email (may differ from public.users email
        // if user was created via phone with a placeholder email)
        const { data: authUserData, error: authLookupErr } = await supabaseAdmin.auth.admin.getUserById(updatedUser.auth_id);
        const authEmail = authUserData?.user?.email;
        console.log("[verifyOtp] auth_id:", updatedUser.auth_id, "authEmail:", authEmail, "publicEmail:", updatedUser.email, "authLookupErr:", authLookupErr?.message);

        if (authEmail) {
          const tempPw = `otp_verified_${updatedUser.auth_id}_${Date.now()}`;
          const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(updatedUser.auth_id, {
            password: tempPw,
          });
          if (pwErr) console.error("[verifyOtp] password update error:", pwErr.message);

          const { data: session, error: signInErr } = await supabasePublic.auth.signInWithPassword({
            email: authEmail,
            password: tempPw,
          });
          if (signInErr) console.error("[verifyOtp] signIn error:", signInErr.message);
          if (session?.session) {
            accessToken = session.session.access_token;
            refreshToken = session.session.refresh_token;
            console.log("[verifyOtp] tokens generated successfully, access_token length:", accessToken.length);
          } else {
            console.error("[verifyOtp] no session returned from signInWithPassword");
          }
        } else {
          console.error("[verifyOtp] no authEmail found for auth_id:", updatedUser.auth_id);
        }
      } else {
        console.error("[verifyOtp] no auth_id on updatedUser, id:", id);
      }

      if (accessToken) {
        setAuthCookies(res, accessToken, refreshToken);
        console.log("[verifyOtp] auth cookies set successfully");
      } else {
        console.error("[verifyOtp] WARNING: no accessToken generated, cookies NOT set");
      }

      return res.json({
        data: {
          ...toUserPayload(updatedUser || user),
          token: accessToken,
          refreshToken,
        },
        message: "User verified successfully",
      });
    } catch (error) {
      console.error("[verifyOtp] error:", error);
      return res
        .status(500)
        .json({ error: { message: "Something went wrong" } });
    }
  };

  /**
   * Update authenticated user's profile.
   */
  static updateMe = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const user = req.user as any;
      const body = req.body;

      // Build update object, mapping camelCase → snake_case
      const updateData: any = {};
      if (body.fullName !== undefined) updateData.full_name = body.fullName;
      if (body.userName !== undefined) updateData.user_name = body.userName;
      if (body.phoneNumber !== undefined) updateData.phone_number = body.phoneNumber;
      if (body.dob !== undefined) updateData.dob = body.dob;
      if (body.bio !== undefined) updateData.bio = body.bio;
      if (body.gender !== undefined) updateData.gender = body.gender;
      if (body.email !== undefined) updateData.email = body.email;
      if (body.dialCode !== undefined) updateData.dial_code = body.dialCode;
      if (body.photoId !== undefined) updateData.photo_id = body.photoId;
      if (body.coverPhotoId !== undefined) updateData.cover_photo_id = body.coverPhotoId;
      if (body.isMentor !== undefined) updateData.is_mentor = body.isMentor;
      if (body.mentorExpertise !== undefined) updateData.mentor_expertise = body.mentorExpertise;
      if (body.mentorCertifications !== undefined) updateData.mentor_certifications = body.mentorCertifications;
      if (body.mentorYearsExperience !== undefined) updateData.mentor_years_experience = body.mentorYearsExperience;
      if (body.mentorHasFreeTrial !== undefined) updateData.mentor_has_free_trial = body.mentorHasFreeTrial;
      if (body.mentorRating !== undefined) updateData.mentor_rating = body.mentorRating;
      if (body.mentorReviewCount !== undefined) updateData.mentor_review_count = body.mentorReviewCount;
      if (body.mentorAiVoiceTone !== undefined) updateData.mentor_ai_voice_tone = body.mentorAiVoiceTone;
      if (body.mentorAiKnowledgeBaseFileIds !== undefined) updateData.mentor_ai_kb_file_ids = body.mentorAiKnowledgeBaseFileIds;
      if (body.mentorAiTrainingPhilosophy !== undefined) updateData.mentor_ai_training_philosophy = body.mentorAiTrainingPhilosophy;
      if (body.mentorAiNutritionPhilosophy !== undefined) updateData.mentor_ai_nutrition_philosophy = body.mentorAiNutritionPhilosophy;
      if (body.mentorAiMacroApproach !== undefined) updateData.mentor_ai_macro_approach = body.mentorAiMacroApproach;
      if (body.mentorAiDietaryNotes !== undefined) updateData.mentor_ai_dietary_notes = body.mentorAiDietaryNotes;
      if (body.youtubeLink !== undefined) updateData.youtube_link = body.youtubeLink;
      if (body.instagramLink !== undefined) updateData.instagram_link = body.instagramLink;
      if (body.tiktokLink !== undefined) updateData.tiktok_link = body.tiktokLink;
      if (body.facebookLink !== undefined) updateData.facebook_link = body.facebookLink;
      if (body.welcomeMessage !== undefined) updateData.welcome_message = body.welcomeMessage;
      if (body.websiteLink !== undefined) updateData.website_link = body.websiteLink;
      if (body.notificationPreferences !== undefined) updateData.notification_preferences = body.notificationPreferences;

      // If password change, update via Supabase Auth
      if (body.password && user.auth_id) {
        const { error: pwError } =
          await supabaseAdmin.auth.admin.updateUserById(user.auth_id, {
            password: body.password,
          });
        if (pwError) {
          return res
            .status(400)
            .json({ error: { message: "Failed to update password" } });
        }
      }

      // If photo set, mark hasPhotoInfo
      if (body.photoId) {
        updateData.has_photo_info = true;
      }

      const { data: updatedUser, error } = await supabaseAdmin
        .from("users")
        .update(updateData)
        .eq("id", user.id)
        .select("*")
        .single();

      if (error || !updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        data: toUserPayload(updatedUser),
        message: "User updated successfully",
      });
    } catch (error) {
      console.error("Error in user update:", error);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };

  /**
   * Check if a user exists by email/phone.
   */
  static checkUser = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const { email, phoneNumber, dialCode } = req.body;
      const completePhone = `${dialCode}--${phoneNumber}`;

      const { data: user } = await supabaseAdmin
        .from("users")
        .select("id")
        .or(`email.eq.${email},complete_phone_number.eq.${completePhone}`)
        .limit(1)
        .maybeSingle();

      if (user) {
        return res.json({ data: { message: "User exist." } });
      }
      return res
        .status(400)
        .json({ data: { message: "User does not exist." } });
    } catch (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong" } });
    }
  };

  /**
   * Fetch the authenticated user's profile with counts.
   */
  static me = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res
          .status(401)
          .json({ error: { message: "Unauthorized" } });
      }

      // Get user with photo joins
      const { data: userRow, error: userError } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (userError || !userRow) {
        return res
          .status(404)
          .json({ error: { message: "User not found." } });
      }

      // Get photo
      let photo = null;
      if (userRow.photo_id) {
        const { data } = await supabaseAdmin
          .from("files")
          .select("*")
          .eq("id", userRow.photo_id)
          .single();
        photo = data;
      }

      // Get cover photo
      let coverPhoto = null;
      if (userRow.cover_photo_id) {
        const { data } = await supabaseAdmin
          .from("files")
          .select("*")
          .eq("id", userRow.cover_photo_id)
          .single();
        coverPhoto = data;
      }

      // Counts (using Supabase RPC or direct queries)
      const [
        followersResult,
        followingResult,
        postsResult,
      ] = await Promise.all([
        supabaseAdmin
          .from("user_connections")
          .select("id", { count: "exact", head: true })
          .eq("following_to", user.id),
        supabaseAdmin
          .from("user_connections")
          .select("id", { count: "exact", head: true })
          .eq("owner", user.id),
        supabaseAdmin
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .eq("type", "POST"),
      ]);

      const followersCount = followersResult.count || 0;
      const followingCount = followingResult.count || 0;
      const postsCount = postsResult.count || 0;

      // Get likes count
      const { data: userPosts } = await supabaseAdmin
        .from("posts")
        .select("id")
        .eq("user_id", user.id);

      let totalLikes = 0;
      if (userPosts && userPosts.length > 0) {
        const postIds = userPosts.map((p: any) => p.id);
        const { count } = await supabaseAdmin
          .from("interactions")
          .select("id", { count: "exact", head: true })
          .in("post_id", postIds)
          .eq("type", "LIKE_POST");
        totalLikes = count || 0;
      }

      // Subscription plans
      const { data: subPlans } = await supabaseAdmin
        .from("subscription_plans")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_deleted", false)
        .in("plan_type", ["CUSTOM", "FIXED"]);

      // Subscriber count
      let subscriberCount = 0;
      if (subPlans && subPlans.length > 0) {
        const planIds = subPlans.map((p: any) => p.id);
        const { count } = await supabaseAdmin
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .in("plan_id", planIds)
          .eq("status", "ACTIVE");
        subscriberCount = count || 0;
      }

      // Platform subscription
      const paidPlanId = (
        process.env.PLATFORM_SUBSCRIPTION_PLAN_ID || ""
      ).trim();
      const freePlanId = (
        process.env.PLATFORM_FREE_SUBSCRIPTION_PLAN_ID || ""
      ).trim();
      const planId = userRow.is_free_subscription
        ? freePlanId || paidPlanId
        : paidPlanId;

      let platformSubscription = null;
      if (planId) {
        const { data } = await supabaseAdmin
          .from("subscriptions")
          .select("id, user_id, plan_id, stripe_subscription_id, stripe_price_id, status, start_date, end_date, created_at, updated_at")
          .eq("user_id", user.id)
          .eq("plan_id", planId)
          .limit(1)
          .maybeSingle();
        platformSubscription = data;
      }

      // Build legacy-compatible payload
      const userPayload = toUserPayload(userRow);
      const payload: any = {
        user: { ...userPayload, photo, coverPhoto },
        followersCount,
        followingCount,
        postsCount,
        totalLikes,
        subscriberCount,
        platformSubscription,
        // Top-level convenience fields (must mirror what frontend middleware checks)
        _id: userRow.id,
        fullName: userRow.full_name,
        userName: userRow.user_name,
        email: userRow.email,
        photo,
        coverPhoto,
        photoId: userRow.photo_id,
        coverPhotoId: userRow.cover_photo_id,
        googleId: userRow.google_id,
        isMentor: Boolean(userRow.is_mentor),
        role: userRow.role,
        hasPersonalInfo: Boolean(userRow.has_personal_info),
        hasPhotoInfo: Boolean(userRow.has_photo_info),
        hasConfirmedAge: Boolean(userRow.has_confirmed_age),
        hasSelectedInterest: Boolean(userRow.has_selected_interest),
        hasDocumentUploaded: Boolean(userRow.has_document_uploaded),
        hasDocumentVerified: Boolean(userRow.has_document_verified),
      };

      return res.json({ data: payload });
    } catch (err) {
      console.error(err, "error in retrieving user");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }
  };

  /**
   * Send OTP for password reset.
   */
  static sendForgotPasswordOtp = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const { dialCode, phoneNumber } = req.body;
      const completePhone = `${dialCode}--${phoneNumber}`;

      const { data: user } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("is_deleted", false)
        .or(`complete_phone_number.eq.${completePhone},and(dial_code.eq.${dialCode},phone_number.eq.${phoneNumber})`)
        .limit(1)
        .maybeSingle();

      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found with this phone number",
        });
      }

      const otp = otpGenerator();
      const otpInvalidAt = addMinutes(new Date(), 10).toISOString();

      await supabaseAdmin
        .from("users")
        .update({ otp: String(otp), otp_invalid_at: otpInvalidAt })
        .eq("id", user.id);

      await sendMessage(
        `${dialCode}--${phoneNumber}`,
        `Your OTP for password reset is: ${otp}`,
      );

      return res.status(200).json({
        status: true,
        message: "OTP sent successfully. Please verify within 10 minutes.",
        otp,
      });
    } catch (error) {
      console.error("Error in sending OTP:", error);
      return res.status(500).json({ status: false, message: "Failed to send OTP." });
    }
  };

  /**
   * Validate OTP for password reset.
   */
  static validateForgotPasswordOtp = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const { dialCode, phoneNumber, otp } = req.body;
      if (!dialCode || !phoneNumber || !otp) {
        return res.status(400).json({
          status: false,
          message: "Phone number, dial code, and OTP are required.",
        });
      }

      const completePhone = `${dialCode}--${phoneNumber}`;
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("is_deleted", false)
        .or(`complete_phone_number.eq.${completePhone},and(dial_code.eq.${dialCode},phone_number.eq.${phoneNumber})`)
        .limit(1)
        .maybeSingle();

      if (!user) {
        return res.status(404).json({
          status: false,
          message: "User not found with this phone number.",
        });
      }

      if (!user.otp || user.otp !== String(otp)) {
        return res.status(400).json({ status: false, message: "Invalid OTP." });
      }

      if (user.otp_invalid_at && new Date() > new Date(user.otp_invalid_at)) {
        return res
          .status(400)
          .json({ status: false, message: "OTP has expired." });
      }

      return res.status(200).json({
        status: true,
        message: "OTP validated successfully.",
        user: toUserPayload(user),
      });
    } catch (error) {
      console.error("Error in validating OTP:", error);
      return res.status(500).json({ status: false, message: "Failed to validate OTP." });
    }
  };

  /**
   * Reset user password.
   */
  static resetPassword = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const { dialCode, phoneNumber, newPassword, confirmPassword } = req.body;

      if (!dialCode || !phoneNumber || !newPassword || !confirmPassword) {
        return res.status(400).json({
          message: "All fields are required.",
        });
      }

      if (newPassword !== confirmPassword) {
        return res
          .status(400)
          .json({ message: "Passwords do not match." });
      }

      const completePhone = `${dialCode}--${phoneNumber}`;
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("is_deleted", false)
        .or(`complete_phone_number.eq.${completePhone},and(dial_code.eq.${dialCode},phone_number.eq.${phoneNumber})`)
        .limit(1)
        .maybeSingle();

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      // Update password via Supabase Auth
      if (user.auth_id) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          user.auth_id,
          { password: newPassword },
        );
        if (error) {
          return res
            .status(500)
            .json({ message: "Failed to reset password." });
        }
      }

      return res.status(200).json({ message: "Password reset successfully." });
    } catch (error) {
      console.error("Error in resetting password:", error);
      return res.status(500).json({ message: "Failed to reset password." });
    }
  };

  /**
   * Refresh access token using Supabase refresh token.
   */
  static refreshToken = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      let refreshToken: string | undefined;

      // Extract from cookie
      if (typeof req.headers.cookie === "string") {
        const match = req.headers.cookie
          .split(";")
          .map((s) => s.trim())
          .find((c) => c.startsWith("refresh_token="));
        if (match) {
          const raw = match.split("=").slice(1).join("=");
          try {
            refreshToken = decodeURIComponent(raw);
          } catch {
            refreshToken = raw;
          }
        }
      }

      if (!refreshToken) {
        return res.status(401).json({
          error: { message: "No refresh token", code: "NO_REFRESH_TOKEN" },
        });
      }

      // Refresh via Supabase
      const { data: session, error } =
        await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });

      if (error || !session.session) {
        // Clear cookies
        res.cookie("auth_token", "", { maxAge: 0, path: "/" });
        res.cookie("refresh_token", "", { maxAge: 0, path: "/" });
        return res.status(401).json({
          error: { message: "Refresh token expired", code: "REFRESH_EXPIRED" },
        });
      }

      // On refresh, always use long-lived cookies (user was already "remembered")
      setAuthCookies(
        res,
        session.session.access_token,
        session.session.refresh_token,
        true,
      );

      return res.json({
        message: "Token refreshed",
        token: session.session.access_token,
        refreshToken: session.session.refresh_token,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: { message: "Something went wrong" } });
    }
  };
}

export { AuthController };
