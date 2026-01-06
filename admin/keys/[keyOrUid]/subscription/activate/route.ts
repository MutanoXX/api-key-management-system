/**
 * POST /api/admin/keys/[keyOrUid]/subscription/activate
 * Activate subscription for an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateEndDate } from '@/lib/api-keys/utils';

export async function POST(
  req: NextRequest,
  { params }: { params: { keyOrUid: string } }
) {
  try {
    const { keyOrUid } = params;
    const body = await req.json();
    const { price, durationDays = 30, autoRenew = false, currency = 'BRL' } = body;

    // Find API key
    const apiKey = await db.apiKey.findUnique({
      where: { uid: keyOrUid },
    });

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'API key not found',
          code: 'API_KEY_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // Check if subscription already exists
    const existingSubscription = await db.subscription.findUnique({
      where: { apiKeyId: apiKey.id },
    });

    if (existingSubscription && existingSubscription.enabled) {
      return NextResponse.json(
        {
          error: 'Subscription already exists for this API key',
          code: 'SUBSCRIPTION_EXISTS',
        },
        { status: 400 }
      );
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = calculateEndDate(startDate, durationDays);

    // Create or update subscription
    let subscription;
    if (existingSubscription) {
      // Update existing subscription
      subscription = await db.subscription.update({
        where: { apiKeyId: apiKey.id },
        data: {
          enabled: true,
          price,
          currency,
          status: 'active',
          startDate,
          endDate,
          renewalDate: autoRenew ? endDate : null,
          autoRenew,
        },
      });
    } else {
      // Create new subscription
      subscription = await db.subscription.create({
        data: {
          apiKeyId: apiKey.id,
          enabled: true,
          price,
          currency,
          status: 'active',
          startDate,
          endDate,
          renewalDate: autoRenew ? endDate : null,
          autoRenew,
        },
      });
    }

    // Activate API key if it's inactive
    if (!apiKey.isActive) {
      await db.apiKey.update({
        where: { id: apiKey.id },
        data: { isActive: true },
      });
    }

    // Create payment history record
    await db.paymentHistory.create({
      data: {
        subscriptionId: subscription.id,
        amount: price,
        currency,
        paymentDate: new Date(),
        reference: `SUB-${Date.now()}`,
        method: 'manual',
        status: 'completed',
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        apiKeyId: apiKey.id,
        action: 'activate_subscription',
        details: JSON.stringify({ price, durationDays, autoRenew }),
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        enabled: subscription.enabled,
        price: subscription.price,
        currency: subscription.currency,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        renewalDate: subscription.renewalDate,
        autoRenew: subscription.autoRenew,
      },
    });
  } catch (error) {
    console.error('[Admin Subscription] Activate error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
