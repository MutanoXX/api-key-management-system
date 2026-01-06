/**
 * Authentication Middleware
 * Validates API keys and JWT tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenAndCheckBlacklist, blacklistToken } from '@/lib/api-keys/jwt';
import { db } from '@/lib/db';

/**
 * Middleware to validate API key
 */
export async function validateApiKey(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'API key is required',
        code: 'MISSING_API_KEY',
      },
      { status: 401 }
    );
  }

  try {
    // Find API key in database
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
            daysRemaining: 0,
            renewalDate: keyRecord.subscription.renewalDate,
          },
          { status: 402 }
        );
      }

      // Calculate days remaining
      const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Add subscription headers
      const response = NextResponse.next();
      response.headers.set('X-Subscription-Status', keyRecord.subscription.status);
      response.headers.set('X-Days-Remaining', daysRemaining.toString());
      if (keyRecord.subscription.renewalDate) {
        response.headers.set('X-Renewal-Date', keyRecord.subscription.renewalDate.toISOString());
      }

      return response;
    }

    // Update last used and usage count
    await db.apiKey.update({
      where: { id: keyRecord.id },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });

    // Add API key info to headers
    const response = NextResponse.next();
    response.headers.set('X-API-Key-Type', keyRecord.type);

    return response;
  } catch (error) {
    console.error('[Auth] API key validation error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * Middleware to validate admin JWT token
 */
export async function validateAdminToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        error: 'Authorization token is required',
        code: 'MISSING_TOKEN',
      },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);

  try {
    // Verify token and check blacklist
    const decoded = await verifyTokenAndCheckBlacklist(token);

    if (!decoded) {
      return NextResponse.json(
        {
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN',
        },
        { status: 401 }
      );
    }

    if (decoded.type !== 'admin') {
      return NextResponse.json(
        {
          error: 'Admin token required',
          code: 'INSUFFICIENT_PERMISSIONS',
        },
        { status: 403 }
      );
    }

    // Get API key from database
    const apiKey = await db.apiKey.findUnique({
      where: { id: decoded.apiKeyId },
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

    return NextResponse.next();
  } catch (error) {
    console.error('[Auth] Token validation error:', error);
    return NextResponse.json(
      {
        error: 'Token validation failed',
        code: 'VALIDATION_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * Wrapper to add auth middleware to API routes
 */
export function withApiKeyAuth(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const authResult = await validateApiKey(req);

    // If authResult is a NextResponse (error), return it
    if (authResult instanceof NextResponse && authResult.status >= 400) {
      return authResult;
    }

    // Otherwise, proceed to handler
    return handler(req);
  };
}

/**
 * Wrapper to add admin auth middleware to API routes
 */
export function withAdminAuth(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const authResult = await validateAdminToken(req);

    // If authResult is a NextResponse (error), return it
    if (authResult instanceof NextResponse && authResult.status >= 400) {
      return authResult;
    }

    // Otherwise, proceed to handler
    return handler(req);
  };
}

/**
 * Middleware to extract API key info from token
 */
export async function extractApiKeyInfo(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = await verifyTokenAndCheckBlacklist(token);

    if (!decoded) {
      return null;
    }

    const apiKey = await db.apiKey.findUnique({
      where: { id: decoded.apiKeyId },
      include: { subscription: true },
    });

    return apiKey;
  } catch (error) {
    console.error('[Auth] Error extracting API key info:', error);
    return null;
  }
}
