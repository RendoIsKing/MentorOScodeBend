/**
 * Legacy JWT utilities — kept for backward compatibility during migration.
 *
 * New auth uses Supabase Auth. These functions are only used by:
 * - The migration script
 * - Any code that hasn't been migrated yet
 */
import { sign, verify, TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";

import { UserInterface } from "../types/UserInterface";

/**
 * Get the JWT secret. Returns a fallback in development if not configured.
 */
export function getJwtSecret(): string {
  const secret = process.env.APP_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    // In production, this would be an error, but since we're migrating to
    // Supabase Auth, return a dummy value so the app can still start.
    console.warn(
      "[WARN] JWT secret is not configured. Legacy JWT auth will not work.",
    );
    return "supabase-migration-no-jwt-secret";
  }
  return secret;
}

function buildUserPayload(user: UserInterface) {
  return {
    id: user._id || (user as any).id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    phoneNumber: user.phoneNumber,
    isActive: user.isActive,
    isVerified: user.isVerified,
    isDeleted: user.isDeleted,
  };
}

export function generateAccessToken(user: UserInterface): string {
  const payload = { ...buildUserPayload(user), type: "access" };
  return sign(payload, getJwtSecret(), { expiresIn: "15m" });
}

export function generateRefreshToken(user: UserInterface): string {
  const payload = { id: user._id || (user as any).id, type: "refresh" };
  return sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

export function generateAuthToken(user: UserInterface): string {
  return generateAccessToken(user);
}

export function generateToken(data: any): string {
  return sign(data, getJwtSecret(), { expiresIn: "15m" });
}

export function verifyToken(token: string): any {
  return verify(token, getJwtSecret());
}

export { TokenExpiredError, JsonWebTokenError };
