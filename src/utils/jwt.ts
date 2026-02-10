import { sign, verify, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';

import { UserInterface } from '../types/UserInterface';

/**
 * Get the JWT secret. Throws at startup if not configured -- never falls back to a hardcoded value.
 */
export function getJwtSecret(): string {
    const secret = process.env.APP_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('[FATAL] JWT secret is not configured. Set APP_SECRET or JWT_SECRET environment variable.');
    }
    return secret;
}

/** Build the standard payload from a user object. */
function buildUserPayload(user: UserInterface) {
    return {
        id: user._id,
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

/**
 * Generate a short-lived access token (15 minutes).
 */
export function generateAccessToken(user: UserInterface): string {
    const payload = { ...buildUserPayload(user), type: 'access' };
    return sign(payload, getJwtSecret(), { expiresIn: '15m' });
}

/**
 * Generate a long-lived refresh token (7 days).
 */
export function generateRefreshToken(user: UserInterface): string {
    const payload = { id: user._id, type: 'refresh' };
    return sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

/**
 * Legacy function kept for backward compatibility.
 * Now generates an access token with 15-minute expiry.
 */
export function generateAuthToken(user: UserInterface): string {
    return generateAccessToken(user);
}

/**
 * Legacy function kept for backward compatibility.
 */
export function generateToken(data: any): string {
    return sign(data, getJwtSecret(), { expiresIn: '15m' });
}

/**
 * Verify a token and return the decoded payload.
 * Throws TokenExpiredError or JsonWebTokenError on failure.
 */
export function verifyToken(token: string): any {
    return verify(token, getJwtSecret());
}

export { TokenExpiredError, JsonWebTokenError };
