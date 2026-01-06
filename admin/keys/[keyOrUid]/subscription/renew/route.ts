/**
 * POST /api/admin/keys/[keyOrUid]/subscription/renew
 * Renew subscription for an API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: { keyOrUid: string } }
) {
  try {
    const { keyOrUid } = params;
    const body = await req.json();
    const { durationDays = 30, paymentReference, amount } = body;

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

    // Calculate new end date
    let newEndDate;
    const now = new Date();

    // If subscription is not expired, extend from current end date
    // If expired, start from now
    if (now > new Date(apiKey.subscription.endDate)) {
      newEndDate = new Date(now);
    } else {
      newEndDate = new Date(apiKey.subscription.endDate);
    }

    newEndDate.setDate(newEndDate.getDate() + durationDays);

    // Update subscription
    const updatedSubscription = await db.subscription.update({
      where: { apiKeyId: apiKey.id },
      data: {
        endDate: newEndDate,
        renewalDate: apiKey.subscription.autoRenew ? newEndDate : null,
        status: 'active',
      },
    });

    // Create payment history record
    await db.paymentHistory.create({
      data: {
        subscriptionId: updatedSubscription.id,
        amount: amount || apiKey.subscription.price,
        currency: apiKey.subscription.currency,
        paymentDate: now,
        reference: paymentReference || `RENEW-${Date.now()}`,
        method: 'manual',
        status: 'completed',
      },
    });

    // Reactivate API key if it was expired/inactive
    if (!apiKey.isActive) {
      await db.apiKey.update({
        where: { id: apiKey.id },
        data: { isActive: true },
      });
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        apiKeyId: apiKey.id,
        action: 'renew_subscription',
        details: JSON.stringify({ durationDays, paymentReference, newEndDate }),
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
      message: 'Subscription renewed successfully',
    });
  } catch (error) {
    console.error('[Admin Subscription] Renew error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
