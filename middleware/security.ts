/**
 * Security Middleware
 * Implements security headers and input sanitization
 */

import { NextRequest, NextResponse } from 'next/server';
import { sanitizeInput } from '@/lib/api-keys/utils';

/**
 * Security headers configuration
 */
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com fonts.googleapis.com; font-src 'self' fonts.gstatic.com cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';",
  'X-Permitted-Cross-Domain-Policies': 'none',
};

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

/**
 * Middleware wrapper for security headers
 */
export function withSecurityHeaders(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const response = await handler(req);
    return applySecurityHeaders(response);
  };
}

/**
 * Sanitize request body
 */
export function sanitizeRequestBody(body: any): any {
  if (typeof body !== 'object' || body === null) {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map(item => sanitizeRequestBody(item));
  }

  const sanitized: any = {};

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeRequestBody(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Middleware wrapper for request sanitization
 */
export function withSanitization(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    // Note: In Next.js, we can't modify the original request body
    // This function is a placeholder for future enhancements
    // For now, sanitization should be done in individual route handlers
    return handler(req);
  };
}

/**
 * Validate request method
 */
export function validateMethod(req: NextRequest, allowedMethods: string[]): boolean {
  return allowedMethods.includes(req.method);
}

/**
 * CORS configuration
 */
export function applyCorsHeaders(
  response: NextResponse,
  allowedOrigins: string[] = ['*'],
  allowedMethods: string[] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: string[] = ['Content-Type', 'Authorization', 'X-API-Key']
): NextResponse {
  if (allowedOrigins.includes('*')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else {
    const origin = req.headers.get('origin');
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }
  }

  response.headers.set('Access-Control-Allow-Methods', allowedMethods.join(', '));
  response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  response.headers.set('Access-Control-Max-Age', '86400');

  return response;
}

/**
 * Handle OPTIONS request for CORS preflight
 */
export function handleCorsPreflight(req: NextRequest): NextResponse | null {
  if (req.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    return applyCorsHeaders(response);
  }
  return null;
}

/**
 * Validate content type
 */
export function validateContentType(
  req: NextRequest,
  allowedTypes: string[] = ['application/json']
): boolean {
  const contentType = req.headers.get('content-type');

  if (!contentType) {
    return allowedTypes.length === 0;
  }

  return allowedTypes.some(type => contentType.includes(type));
}

/**
 * Validate API key format
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  // Format: Prefix-xxxxxxxxxxxxxxxx (min 20 chars, max 50 chars)
  const regex = /^[A-Za-z0-9-]{20,50}$/;
  return regex.test(apiKey);
}

/**
 * Validate UID format (UUID)
 */
export function validateUidFormat(uid: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uid);
}

/**
 * Sanitize error messages (don't expose sensitive information)
 */
export function sanitizeErrorMessage(error: any): string {
  // Don't expose internal errors
  if (error instanceof Error && error.message.includes('prisma')) {
    return 'Internal database error';
  }

  if (typeof error === 'string') {
    // Don't expose file paths
    return error.replace(/\/[^\s]+/g, '[REDACTED]');
  }

  return 'An error occurred';
}

/**
 * Check for common attack patterns in input
 */
export function detectAttackPattern(input: string): boolean {
  const patterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // XSS
    /('|(–)|(%27)|(%3D)|(%3B)|(--)|(%23)|(%2F)|(%2A)/gi, // SQL Injection
    /\.\.\//g, // Path traversal
    /javascript:/gi, // JavaScript protocol
    /data:text\/html/gi, // Data URI
    /on\w+\s*=/gi, // Event handlers
  ];

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Validate input for security
 */
export function validateInputSecurity(input: string): {
  valid: boolean;
  reason?: string;
} {
  if (detectAttackPattern(input)) {
    return {
      valid: false,
      reason: 'Potentially malicious input detected',
    };
  }

  // Check for very long inputs (potential DoS)
  if (input.length > 10000) {
    return {
      valid: false,
      reason: 'Input too long',
    };
  }

  return { valid: true };
}

/**
 * Comprehensive security wrapper
 */
export function withSecurity(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: {
    allowedMethods?: string[];
    allowedContentTypes?: string[];
    corsOrigins?: string[];
    requireAuth?: boolean;
  } = {}
) {
  return async (req: NextRequest) => {
    const {
      allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'],
      allowedContentTypes = ['application/json'],
      corsOrigins = ['*'],
      requireAuth = false,
    } = options;

    // Handle CORS preflight
    const corsResponse = handleCorsPreflight(req);
    if (corsResponse) {
      return corsResponse;
    }

    // Validate method
    if (!validateMethod(req, allowedMethods)) {
      const response = NextResponse.json(
        {
          error: 'Method not allowed',
          code: 'METHOD_NOT_ALLOWED',
        },
        { status: 405 }
      );
      return applyCorsHeaders(applySecurityHeaders(response), corsOrigins);
    }

    // Validate content type for non-GET requests
    if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'OPTIONS') {
      if (!validateContentType(req, allowedContentTypes)) {
        const response = NextResponse.json(
          {
            error: 'Invalid content type',
            code: 'INVALID_CONTENT_TYPE',
          },
          { status: 415 }
        );
        return applyCorsHeaders(applySecurityHeaders(response), corsOrigins);
      }
    }

    // Execute handler
    const response = await handler(req);

    // Apply CORS and security headers
    return applyCorsHeaders(applySecurityHeaders(response), corsOrigins);
  };
}

/**
 * CSRF token validation (placeholder for future implementation)
 */
export function validateCsrfToken(req: NextRequest, token: string): boolean {
  // In a real implementation, you would validate the CSRF token
  // This could be from a cookie or header
  return true;
}

/**
 * Generate CSRF token (placeholder for future implementation)
 */
export function generateCsrfToken(): string {
  // In a real implementation, you would generate a secure random token
  return crypto.randomUUID();
}
