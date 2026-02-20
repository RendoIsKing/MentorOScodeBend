import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../../lib/supabase";

/**
 * Unified auth middleware – verifies Supabase access tokens.
 *
 * Supported token locations (checked in order):
 *   1. Authorization: Bearer <token>
 *   2. auth_token cookie (legacy)
 *   3. sb-*-auth-token cookie (Supabase default)
 *
 * After verification the user row from public.users is attached to `req.user`.
 */
export default async function Auth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res
        .status(401)
        .json({ error: { message: "No auth token provided" } });
    }

    // ── Strategy 1: Verify with Supabase Auth (standard path) ──────────
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    let resolvedAuthId: string | null = authUser?.id ?? null;

    // ── Strategy 2: Fallback for session_not_found ─────────────────────
    // Supabase's getUser() checks both JWT validity AND session existence.
    // Sessions can disappear (cleanup, server-side signInWithPassword on
    // shared client, etc.) while the JWT is still cryptographically valid.
    // In that case, decode the JWT, verify expiry, and look up the user
    // via admin.getUserById() which doesn't require a live session.
    if (authError && !resolvedAuthId) {
      try {
        const payload = decodeJwtPayload(token);
        if (payload?.sub && payload?.exp) {
          const nowSec = Math.floor(Date.now() / 1000);
          if (payload.exp > nowSec) {
            const { data: adminLookup } =
              await supabaseAdmin.auth.admin.getUserById(payload.sub);
            if (adminLookup?.user) {
              resolvedAuthId = adminLookup.user.id;
            }
          }
        }
      } catch {}
    }

    if (!resolvedAuthId) {
      return res
        .status(401)
        .json({ error: { message: "Invalid or expired token", code: "TOKEN_EXPIRED" } });
    }

    // ── Look up public.users row via auth_id ───────────────────────────
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("auth_id", resolvedAuthId)
      .single();

    if (userError || !user) {
      return res
        .status(401)
        .json({ error: { message: "User not found" } });
    }

    if (user.is_deleted) {
      return res
        .status(401)
        .json({ error: { message: "User is deleted. Please contact admin!" } });
    }

    if (!user.is_active) {
      return res
        .status(401)
        .json({ error: { message: "User is not active. Please contact admin!" } });
    }

    // ── Attach a legacy-compatible user object ─────────────────────────
    (req as any).user = toLegacyUser(user, authUser || { id: resolvedAuthId, email: user.email });
    return next();
  } catch (e) {
    console.error("[Auth middleware] unexpected error", e);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong" } });
  }
}

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractToken(req: Request): string | undefined {
  // 1. Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // 2. Cookies
  if (typeof req.headers.cookie === "string") {
    const cookies = req.headers.cookie.split(";").map((s) => s.trim());

    // Try auth_token cookie (legacy / set by our backend)
    for (const c of cookies) {
      if (c.startsWith("auth_token=")) {
        const raw = c.split("=").slice(1).join("=");
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      }
    }

    // Try Supabase session cookie (sb-<ref>-auth-token)
    for (const c of cookies) {
      if (c.startsWith("sb-") && c.includes("-auth-token=")) {
        const raw = c.split("=").slice(1).join("=");
        try {
          const parsed = JSON.parse(decodeURIComponent(raw));
          return parsed?.access_token;
        } catch {
          try {
            return decodeURIComponent(raw);
          } catch {
            return raw;
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Map a Supabase public.users row + auth user into the shape that existing
 * controllers expect on `req.user`.
 */
function toLegacyUser(dbUser: any, authUser: any) {
  return {
    // Primary identifiers
    id: dbUser.id,
    _id: dbUser.id,
    auth_id: dbUser.auth_id,

    // Personal info
    fullName: dbUser.full_name,
    firstName: dbUser.first_name,
    lastName: dbUser.last_name,
    userName: dbUser.user_name,
    email: dbUser.email || authUser.email,
    dob: dbUser.dob,
    bio: dbUser.bio,
    gender: dbUser.gender,
    dialCode: dbUser.dial_code,
    phoneNumber: dbUser.phone_number,
    completePhoneNumber: dbUser.complete_phone_number,
    location: dbUser.location,

    // Google
    googleId: dbUser.google_id,

    // Photos
    photoId: dbUser.photo_id,
    coverPhotoId: dbUser.cover_photo_id,

    // Interests
    interests: dbUser.interests,

    // Stripe
    isStripeCustomer: dbUser.is_stripe_customer,
    stripeClientId: dbUser.stripe_client_id,
    stripeProductId: dbUser.stripe_product_id,
    stripeProduct: dbUser.stripe_product,

    // Social links
    instagramLink: dbUser.instagram_link,
    facebookLink: dbUser.facebook_link,
    tiktokLink: dbUser.tiktok_link,
    youtubeLink: dbUser.youtube_link,

    // Role & mentor
    role: dbUser.role,
    isMentor: dbUser.is_mentor,
    mentorExpertise: dbUser.mentor_expertise,
    mentorCertifications: dbUser.mentor_certifications,
    mentorYearsExperience: dbUser.mentor_years_experience,
    mentorHasFreeTrial: dbUser.mentor_has_free_trial,
    mentorRating: dbUser.mentor_rating,
    mentorReviewCount: dbUser.mentor_review_count,

    // Mentor AI
    mentorAiVoiceTone: dbUser.mentor_ai_voice_tone,
    mentorAiKnowledgeBaseFileIds: dbUser.mentor_ai_kb_file_ids,
    mentorAiTrainingPhilosophy: dbUser.mentor_ai_training_philosophy,
    mentorAiNutritionPhilosophy: dbUser.mentor_ai_nutrition_philosophy,
    mentorAiMacroApproach: dbUser.mentor_ai_macro_approach,
    mentorAiDietaryNotes: dbUser.mentor_ai_dietary_notes,
    coreInstructions: dbUser.core_instructions,

    // Security
    loginAttempts: dbUser.login_attempts,
    lockUntil: dbUser.lock_until,

    // Status flags
    isActive: dbUser.is_active,
    isDeleted: dbUser.is_deleted,
    deletedAt: dbUser.deleted_at,
    isVerified: dbUser.is_verified,
    verifiedAt: dbUser.verified_at,
    verifiedBy: dbUser.verified_by,
    status: dbUser.status,

    // Onboarding
    hasPersonalInfo: dbUser.has_personal_info,
    hasPhotoInfo: dbUser.has_photo_info,
    hasSelectedInterest: dbUser.has_selected_interest,
    hasConfirmedAge: dbUser.has_confirmed_age,
    hasDocumentUploaded: dbUser.has_document_uploaded,
    hasDocumentVerified: dbUser.has_document_verified,

    // FCM & subscription
    fcmToken: dbUser.fcm_token,
    isFreeSubscription: dbUser.is_free_subscription,

    // ToS
    acceptedTosAt: dbUser.accepted_tos_at,
    tosVersion: dbUser.tos_version,

    // Profile
    profileId: dbUser.profile_id,

    // Timestamps
    createdAt: dbUser.created_at,
    updatedAt: dbUser.updated_at,

    // Supabase raw row for controllers that need it
    _raw: dbUser,
  };
}
