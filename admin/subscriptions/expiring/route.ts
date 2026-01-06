/**
 * GET /api/admin/subscriptions/expiring
 * List subscriptions expiring soon
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isSubscriptionNearExpiry, isSubscriptionExpired } from '@/lib/api-keys/utils';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '7');
    const status = searchParams.get('status'); // 'expiring', 'expired', 'all'

    const now = new Date();
    const thresholdDate = new Date(now);
    thresholdDate.setDate(thresholdDate.getDate() + days);

    // Get subscriptions
    const subscriptions = await db.subscription.findMany({
      where: {
        enabled: true,
      },
      include: {
        apiKey: {
          select: {
            id: true,
            uid: true,
            name: true,
            type: true,
            keyValue: true,
          },
        },
      },
      orderBy: {
        endDate: 'asc',
      },
    });

    // Filter based on status
    let filteredSubscriptions = subscriptions;

    if (status === 'expiring') {
      filteredSubscriptions = subscriptions.filter(sub =>
        isSubscriptionNearExpiry(sub.endDate, days) && !isSubscriptionExpired(sub.endDate)
      );
    } else if (status === 'expired') {
      filteredSubscriptions = subscriptions.filter(sub => isSubscriptionExpired(sub.endDate));
    }

    return NextResponse.json({
      success: true,
      subscriptions: filteredSubscriptions.map(sub => {
        const expired = isSubscriptionExpired(sub.endDate);
        const daysRemaining = Math.ceil((sub.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: sub.id,
          apiKey: sub.apiKey,
          enabled: sub.enabled,
          price: sub.price,
          currency: sub.currency,
          status: expired ? 'expired' : (daysRemaining <= days ? 'expiring' : 'active'),
          startDate: sub.startDate,
          endDate: sub.endDate,
          renewalDate: sub.renewalDate,
          autoRenew: sub.autoRenew,
          daysRemaining: Math.max(0, daysRemaining),
        };
      }),
      summary: {
        total: subscriptions.length,
        active: subscriptions.filter(s => !isSubscriptionExpired(s.endDate)).length,
        expired: subscriptions.filter(s => isSubscriptionExpired(s.endDate)).length,
        expiring: subscriptions.filter(s => isSubscriptionNearExpiry(s.endDate, days)).length,
      },
    });
  } catch (error) {
    console.error('[Admin Subscriptions] List expiring error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
