/**
 * JWT Service for API Key Management System
 * Handles token generation, verification, and blacklisting
 */

import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '1h'; // 1 hour for session tokens
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // 7 days for refresh tokens

export interface JwtPayload {
  apiKeyId: string;
  apiKeyUid: string;
  type: string; // 'admin' or 'user'
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT token for admin session
 */
export function generateToken(payload: JwtPayload, expiresIn: string = JWT_EXPIRES_IN): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Generate admin session token
 */
export function generateAdminToken(apiKey: { uid: string; id: string }): string {
  return generateToken(
    {
      apiKeyId: apiKey.id,
      apiKeyUid: apiKey.uid,
      type: 'admin',
    },
    JWT_EXPIRES_IN
  );
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(apiKey: { uid: string; id: string }): string {
  return generateToken(
    {
      apiKeyId: apiKey.id,
      apiKeyUid: apiKey.uid,
      type: 'refresh',
    },
    REFRESH_TOKEN_EXPIRES_IN
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    console.error('[JWT] Token verification failed:', error);
    return null;
  }
}

/**
 * Check if token is blacklisted
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    const blacklistedToken = await db.jwtBlacklist.findUnique({
      where: { token },
    });

    if (!blacklistedToken) {
      return false;
    }

    // Check if the token has expired from blacklist
    if (new Date() > blacklistedToken.expiresAt) {
      // Clean up expired token from blacklist
      await db.jwtBlacklist.delete({
        where: { token },
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[JWT] Error checking token blacklist:', error);
    return false;
  }
}

/**
 * Add token to blacklist
 */
export async function blacklistToken(token: string, expiresIn: number = 3600): Promise<void> {
  try {
    const decoded = verifyToken(token);
    if (!decoded) {
      throw new Error('Invalid token');
    }

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

    await db.jwtBlacklist.create({
      data: {
        token,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('[JWT] Error blacklisting token:', error);
    throw error;
  }
}

/**
 * Clean up expired tokens from blacklist
 */
export async function cleanExpiredTokens(): Promise<void> {
  try {
    await db.jwtBlacklist.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    console.log('[JWT] Cleaned up expired tokens from blacklist');
  } catch (error) {
    console.error('[JWT] Error cleaning expired tokens:', error);
  }
}

/**
 * Verify token and check blacklist
 */
export async function verifyTokenAndCheckBlacklist(token: string): Promise<JwtPayload | null> {
  // Check if token is blacklisted
  const isBlacklisted = await isTokenBlacklisted(token);
  if (isBlacklisted) {
    console.warn('[JWT] Token is blacklisted');
    return null;
  }

  // Verify token
  const decoded = verifyToken(token);
  return decoded;
}

/**
 * Get token expiration time in seconds
 */
export function getTokenExpiresIn(expiresIn: string = JWT_EXPIRES_IN): number {
  const match = expiresIn.match(/^(\d+)([dhm])$/);
  if (!match) return 3600; // Default 1 hour

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60;
    case 'h':
      return value * 60 * 60;
    case 'm':
      return value * 60;
    default:
      return 3600;
  }
}

/**
 * Refresh token
 */
export async function refreshToken(refreshTokenStr: string): Promise<{ token: string; refreshToken: string } | null> {
  try {
    const decoded = verifyTokenAndCheckBlacklist(refreshTokenStr);
    if (!decoded || decoded.type !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    // Get API key from database
    const apiKey = await db.apiKey.findUnique({
      where: { id: decoded.apiKeyId },
      include: { subscription: true },
    });

    if (!apiKey || !apiKey.isActive) {
      throw new Error('API key not found or inactive');
    }

    // Check subscription if enabled
    if (apiKey.subscription && apiKey.subscription.enabled) {
      const isExpired = new Date() > apiKey.subscription.endDate;
      if (isExpired) {
        throw new Error('Subscription expired');
      }
    }

    // Generate new tokens
    const newToken = generateAdminToken(apiKey);
    const newRefreshToken = generateRefreshToken(apiKey);

    // Blacklist old refresh token
    await blacklistToken(refreshTokenStr, 7 * 24 * 60 * 60); // 7 days

    return {
      token: newToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    console.error('[JWT] Error refreshing token:', error);
    return null;
  }
}

/**
 * Logout - blacklist token
 */
export async function logout(token: string): Promise<void> {
  try {
    const decoded = verifyToken(token);
    if (!decoded) {
      throw new Error('Invalid token');
    }

    // Get remaining time until expiration
    const expiresIn = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;

    // Add to blacklist
    await blacklistToken(token, expiresIn);
  } catch (error) {
    console.error('[JWT] Error during logout:', error);
    throw error;
  }
}
