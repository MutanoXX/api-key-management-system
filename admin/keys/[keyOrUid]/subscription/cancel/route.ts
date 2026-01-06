/**
 * POST /api/admin/keys/[keyOrUid]/subscription/cancel
 * Cancel subscription for an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { keyOrUid: string } }
) {
  try {
    const { keyOrUid } = params;

    // Find API key
    const apiKey = await db.apiKey.findUnique({
      where: { uid: keyOrUid },
      include: { subscription: true },
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

    if (!apiKey.subscription) {
      return NextResponse.json(
        {
          error: 'No subscription found for this API key',
          code: 'NO_SUBSCRIPTION',
        },
        { status: 400 }
      );
    }

    if (!apiKey.subscription.enabled) {
      return NextResponse.json(
        {
          error: 'Subscription is not active',
          code: 'SUBSCRIPTION_NOT_ACTIVE',
        },
        { status: 400 }
      );
    }

    // Cancel subscription (doesn't remove immediately, just disables auto-renew)
    const updatedSubscription = await db.subscription.update({
      where: { apiKeyId: apiKey.id },
      data: {
        autoRenew: false,
        status: 'cancelled',
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        apiKeyId: apiKey.id,
        action: 'cancel_subscription',
        details: JSON.stringify({
          endDate: updatedSubscription.endDate,
          wasActive: true,
        }),
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      subscription: {
        id: updatedSubscription.id,
        enabled: updatedSubscription.enabled,
        price: updatedSubscription.price,
        currency: updatedSubscription.currency,
        status: updatedSubscription.status,
        startDate: updatedSubscription.startDate,
        endDate: updatedSubscription.endDate,
        renewalDate: updatedSubscription.renewalDate,
        autoRenew: updatedSubscription.autoRenew,
      },
      message: 'Subscription cancelled successfully',
      note: 'The subscription will expire naturally at the end date',
    });
  } catch (error) {
    console.error('[Admin Subscription] Cancel error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
