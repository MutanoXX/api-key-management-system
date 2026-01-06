/**
 * POST /api/admin/auth/validate
 * Validates admin API key and returns JWT session token
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateAdminToken, generateRefreshToken, verifyTokenAndCheckBlacklist, blacklistToken } from '@/lib/api-keys/jwt';
import { withLoginRateLimit, withSecurity } from '@/lib/middleware';

export const POST = withLoginRateLimit(
  withSecurity(async (req: NextRequest) => {
    try {
      const body = await req.json();
      const { apiKey } = body;

      if (!apiKey || typeof apiKey !== 'string') {
        return NextResponse.json(
          {
            error: 'API key is required',
            code: 'MISSING_API_KEY',
          },
          { status: 400 }
        );
      }

      // Find admin API key
      const keyRecord = await db.apiKey.findUnique({
        where: { keyValue: apiKey },
        include: { subscription: true },
      });

      if (!keyRecord) {
        return NextResponse.json(
          {
            error: 'Invalid API key',
            code: 'INVALID_API_KEY',
          },
          { status: 401 }
        );
      }

      if (!keyRecord.isActive) {
        return NextResponse.json(
          {
            error: 'API key is inactive',
            code: 'INACTIVE_API_KEY',
          },
          { status: 403 }
        );
      }

      if (keyRecord.type !== 'admin') {
        return NextResponse.json(
          {
            error: 'Admin API key required',
            code: 'NOT_ADMIN_KEY',
          },
          { status: 403 }
        );
      }

      // Check subscription if enabled
      if (keyRecord.subscription && keyRecord.subscription.enabled) {
        const now = new Date();
        const endDate = new Date(keyRecord.subscription.endDate);

        if (now > endDate) {
          // Update subscription status to expired
          await db.subscription.update({
            where: { id: keyRecord.subscription.id },
            data: { status: 'expired' },
          });

          return NextResponse.json(
            {
              error: 'Subscription expired',
              code: 'SUBSCRIPTION_EXPIRED',
            },
            { status: 403 }
          );
        }
      }

      // Generate JWT tokens
      const token = generateAdminToken(keyRecord);
      const refreshToken = generateRefreshToken(keyRecord);

      // Create audit log
      await db.auditLog.create({
        data: {
          apiKeyId: keyRecord.id,
          action: 'admin_login',
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          userAgent: req.headers.get('user-agent') || undefined,
        },
      });

      // Update last used
      await db.apiKey.update({
        where: { id: keyRecord.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });

      return NextResponse.json({
        valid: true,
        token,
        refreshToken,
        expiresIn: 3600, // 1 hour
        apiKey: {
          uid: keyRecord.uid,
          name: keyRecord.name,
          type: keyRecord.type,
        },
      });
    } catch (error) {
      console.error('[Admin Auth] Validation error:', error);
      return NextResponse.json(
        {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
        { status: 500 }
      );
    }
  })
);

/**
 * GET /api/admin/auth/refresh
 * Refresh JWT token using refresh token
 */

export const GET = withSecurity(async (req: NextRequest) => {
  try {
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          error: 'Refresh token is required',
          code: 'MISSING_REFRESH_TOKEN',
        },
        { status: 401 }
      );
    }

    const refreshToken = authHeader.substring(7);

    // Verify refresh token
    const decoded = await verifyTokenAndCheckBlacklist(refreshToken);

    if (!decoded || decoded.type !== 'refresh') {
      return NextResponse.json(
        {
          error: 'Invalid or expired refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        },
        { status: 401 }
      );
    }

    // Get API key from database
    const apiKey = await db.apiKey.findUnique({
      where: { id: decoded.apiKeyId },
      include: { subscription: true },
    });

    if (!apiKey || !apiKey.isActive || apiKey.type !== 'admin') {
      return NextResponse.json(
        {
          error: 'Invalid admin credentials',
          code: 'INVALID_ADMIN',
        },
        { status: 403 }
      );
    }

    // Check subscription if enabled
    if (apiKey.subscription && apiKey.subscription.enabled) {
      const now = new Date();
      const endDate = new Date(apiKey.subscription.endDate);

      if (now > endDate) {
        return NextResponse.json(
          {
            error: 'Subscription expired',
            code: 'SUBSCRIPTION_EXPIRED',
          },
          { status: 403 }
        );
      }
    }

    // Generate new tokens
    const newToken = generateAdminToken(apiKey);
    const newRefreshToken = generateRefreshToken(apiKey);

    // Blacklist old refresh token
    await blacklistToken(refreshToken, 7 * 24 * 60 * 60);

    return NextResponse.json({
      valid: true,
      token: newToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('[Admin Auth] Refresh error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/admin/auth/logout
 * Invalidate current session token
 */

export const DELETE = withSecurity(async (req: NextRequest) => {
  try {
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          error: 'Token is required',
          code: 'MISSING_TOKEN',
        },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Blacklist token
    await blacklistToken(token);

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('[Admin Auth] Logout error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
});
