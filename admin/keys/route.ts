/**
 * POST /api/admin/keys
 * Create a new API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateApiKey, generateUid } from '@/lib/api-keys/utils';
import { withAdminAuth, withAdminRateLimit, withSecurity } from '@/lib/middleware';

export const POST = withAdminRateLimit(
  withSecurity(
    withAdminAuth(async (req: NextRequest) => {
      try {
        const body = await req.json();
        const { name, type = 'normal', rateLimit, rateLimitWindow, subscription } = body;

        // Validate input
        if (!name || typeof name !== 'string') {
          return NextResponse.json(
            {
              error: 'Name is required',
              code: 'MISSING_NAME',
            },
            { status: 400 }
          );
        }

        if (type !== 'admin' && type !== 'normal') {
          return NextResponse.json(
            {
              error: 'Invalid type. Must be "admin" or "normal"',
              code: 'INVALID_TYPE',
            },
            { status: 400 }
          );
        }

        // Generate API key
        const apiKey = generateApiKey();
        const uid = generateUid();

        // Create API key
        const newKey = await db.apiKey.create({
          data: {
            uid,
            keyValue: apiKey,
            name,
            type,
            rateLimit: rateLimit || null,
            rateLimitWindow: rateLimitWindow || null,
          },
        });

        // Create subscription if provided
        let subscriptionData = null;
        if (subscription && subscription.enabled) {
          const startDate = new Date();
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + (subscription.durationDays || 30));

          const newSubscription = await db.subscription.create({
            data: {
              apiKeyId: newKey.id,
              enabled: true,
              price: subscription.price || 50,
              currency: subscription.currency || 'BRL',
              status: 'active',
              startDate,
              endDate,
              renewalDate: subscription.autoRenew ? endDate : null,
              autoRenew: subscription.autoRenew || false,
            },
          });

          subscriptionData = {
            id: newSubscription.id,
            enabled: newSubscription.enabled,
            price: newSubscription.price,
            currency: newSubscription.currency,
            status: newSubscription.status,
            startDate: newSubscription.startDate,
            endDate: newSubscription.endDate,
            renewalDate: newSubscription.renewalDate,
            autoRenew: newSubscription.autoRenew,
          };
        }

        // Create audit log
        await db.auditLog.create({
          data: {
            apiKeyId: newKey.id,
            action: 'create_api_key',
            details: JSON.stringify({ name, type, hasSubscription: !!subscription }),
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            userAgent: req.headers.get('user-agent') || undefined,
          },
        });

        return NextResponse.json({
          success: true,
          apiKey: {
            id: newKey.id,
            uid: newKey.uid,
            keyValue: newKey.keyValue,
            name: newKey.name,
            type: newKey.type,
            isActive: newKey.isActive,
            createdAt: newKey.createdAt,
            rateLimit: newKey.rateLimit,
            rateLimitWindow: newKey.rateLimitWindow,
            subscription: subscriptionData,
          },
        });
      } catch (error) {
        console.error('[Admin Keys] Create error:', error);
        return NextResponse.json(
          {
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
          },
          { status: 500 }
        );
      }
    })
  )
);

/**
 * GET /api/admin/keys
 * List all API keys with optional filters
 */

export const GET = withAdminRateLimit(
  withSecurity(
    withAdminAuth(async (req: NextRequest) => {
      try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');
        const type = searchParams.get('type');
        const hasSubscription = searchParams.get('hasSubscription');
        const search = searchParams.get('search');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        // Build where clause
        const where: any = {};

        if (status === 'active') {
          where.isActive = true;
        } else if (status === 'inactive') {
          where.isActive = false;
        }

        if (type === 'admin' || type === 'normal') {
          where.type = type;
        }

        if (hasSubscription === 'true') {
          where.subscription = { isNot: null };
        } else if (hasSubscription === 'false') {
          where.subscription = { is: null };
        }

        if (search) {
          where.OR = [
            { name: { contains: search } },
            { uid: { contains: search } },
          ];
        }

        // Get total count
        const total = await db.apiKey.count({ where });

        // Get API keys with pagination
        const apiKeys = await db.apiKey.findMany({
          where,
          include: {
            subscription: {
              include: {
                paymentHistory: {
                  orderBy: { paymentDate: 'desc' },
                  take: 5,
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        });

        return NextResponse.json({
          success: true,
          apiKeys: apiKeys.map((key) => ({
            id: key.id,
            uid: key.uid,
            keyValue: key.keyValue,
            name: key.name,
            type: key.type,
            isActive: key.isActive,
            createdAt: key.createdAt,
            updatedAt: key.updatedAt,
            lastUsedAt: key.lastUsedAt,
            usageCount: key.usageCount,
            rateLimit: key.rateLimit,
            rateLimitWindow: key.rateLimitWindow,
            subscription: key.subscription
              ? {
                  id: key.subscription.id,
                  enabled: key.subscription.enabled,
                  price: key.subscription.price,
                  currency: key.subscription.currency,
                  status: key.subscription.status,
                  startDate: key.subscription.startDate,
                  endDate: key.subscription.endDate,
                  renewalDate: key.subscription.renewalDate,
                  autoRenew: key.subscription.autoRenew,
                  paymentHistory: key.subscription.paymentHistory,
                }
              : null,
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        console.error('[Admin Keys] List error:', error);
        return NextResponse.json(
          {
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
          },
          { status: 500 }
        );
      }
    })
  )
);
