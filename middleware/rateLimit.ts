/**
 * Rate Limiting Middleware
 * Implements rate limiting by IP and API key
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory storage (in production, use Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  requests: number;
  window: number; // in milliseconds
}

/**
 * Default rate limits
 */
const DEFAULT_RATE_LIMITS = {
  public: { requests: 100, window: 60 * 1000 }, // 100 requests per minute
  apiKey: { requests: 1000, window: 60 * 1000 }, // 1000 requests per minute
  admin: { requests: 500, window: 60 * 1000 }, // 500 requests per minute
  login: { requests: 5, window: 15 * 60 * 1000 }, // 5 requests per 15 minutes
};

/**
 * Check if request is rate limited
 */
export function checkRateLimit(identifier: string, config: RateLimitConfig): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired entry
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.window,
    };
    rateLimitStore.set(identifier, newEntry);

    return {
      allowed: true,
      remaining: config.requests - 1,
      resetTime: newEntry.resetTime,
    };
  }

  // Increment count
  entry.count++;

  if (entry.count > config.requests) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }

  return {
    allowed: true,
    remaining: config.requests - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Get client identifier (IP or API key)
 */
function getClientIdentifier(request: NextRequest, useApiKey: boolean = false): string {
  if (useApiKey) {
    const apiKey = request.headers.get('x-api-key');
    return apiKey ? `apikey:${apiKey}` : `ip:${getClientIp(request)}`;
  }

  return `ip:${getClientIp(request)}`;
}

/**
 * Get client IP address
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  if (realIp) {
    return realIp;
  }
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return 'unknown';
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupExpiredRateLimits(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [identifier, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      keysToDelete.push(identifier);
    }
  }

  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }
}

/**
 * Run cleanup periodically (every 5 minutes)
 */
if (typeof window === 'undefined') {
  setInterval(cleanupExpiredRateLimits, 5 * 60 * 1000);
}

/**
 * Rate limiting middleware for public endpoints
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS.public
) {
  return async (req: NextRequest) => {
    const identifier = getClientIdentifier(req);
    const result = checkRateLimit(identifier, config);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.requests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const response = await handler(req);

    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', config.requests.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    return response;
  };
}

/**
 * Rate limiting middleware for API key endpoints
 */
export function withApiKeyRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS.apiKey
) {
  return async (req: NextRequest) => {
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) {
      return withRateLimit(handler, config)(req);
    }

    const identifier = `apikey:${apiKey}`;
    const result = checkRateLimit(identifier, config);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: 'API key rate limit exceeded',
          code: 'API_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.requests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const response = await handler(req);

    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', config.requests.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    return response;
  };
}

/**
 * Rate limiting middleware for login endpoint
 */
export function withLoginRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS.login
) {
  return async (req: NextRequest) => {
    const identifier = getClientIdentifier(req);
    const result = checkRateLimit(identifier, config);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: 'Too many login attempts. Please try again later.',
          code: 'LOGIN_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.requests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const response = await handler(req);

    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', config.requests.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    return response;
  };
}

/**
 * Rate limiting middleware for admin endpoints
 */
export function withAdminRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS.admin
) {
  return async (req: NextRequest) => {
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return withRateLimit(handler, config)(req);
    }

    const token = authHeader.substring(7);
    const identifier = `token:${token}`;
    const result = checkRateLimit(identifier, config);

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: 'Admin rate limit exceeded',
          code: 'ADMIN_RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.requests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const response = await handler(req);

    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', config.requests.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    return response;
  };
}
