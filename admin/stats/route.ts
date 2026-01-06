/**
 * GET /api/admin/stats
 * Get overall statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isSubscriptionExpired } from '@/lib/api-keys/utils';

export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get total API keys count
    const totalKeys = await db.apiKey.count();

    // Get active API keys count
    const activeKeys = await db.apiKey.count({
      where: { isActive: true },
    });

    // Get admin keys count
    const adminKeys = await db.apiKey.count({
      where: { type: 'admin' },
    });

    // Get active subscriptions count
    const allSubscriptions = await db.subscription.findMany({
      where: { enabled: true },
    });

    const activeSubscriptions = allSubscriptions.filter(s => !isSubscriptionExpired(s.endDate)).length;
    const expiredSubscriptions = allSubscriptions.filter(s => isSubscriptionExpired(s.endDate)).length;

    // Get total revenue
    const allPayments = await db.paymentHistory.findMany({
      where: { status: 'completed' },
    });

    const totalRevenue = allPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Get revenue in last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentPayments = allPayments.filter(p => p.paymentDate >= thirtyDaysAgo);
    const recentRevenue = recentPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Get usage stats (last 24 hours)
    const recentUsageLogs = await db.usageLog.findMany({
      where: {
        createdAt: {
          gte: yesterday,
        },
      },
    });

    const requestsLast24h = recentUsageLogs.length;

    // Get top 10 most used API keys
    const topKeys = await db.apiKey.findMany({
      orderBy: {
        usageCount: 'desc',
      },
      take: 10,
      include: {
        subscription: true,
      },
    });

    // Get keys expiring in next 7 days
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSoon = allSubscriptions.filter(s => {
      const endDate = new Date(s.endDate);
      return endDate > now && endDate <= sevenDaysFromNow && !isSubscriptionExpired(s.endDate);
    }).length;

    // Get keys expiring in next 30 days
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringIn30Days = allSubscriptions.filter(s => {
      const endDate = new Date(s.endDate);
      return endDate > now && endDate <= thirtyDaysFromNow && !isSubscriptionExpired(s.endDate);
    }).length;

    // Get recent audit logs
    const recentAuditLogs = await db.auditLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
      include: {
        apiKey: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      timestamp: now,
      overview: {
        totalKeys,
        activeKeys,
        inactiveKeys: totalKeys - activeKeys,
        adminKeys,
        normalKeys: totalKeys - adminKeys,
      },
      subscriptions: {
        total: allSubscriptions.length,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
        expiringSoon,
        expiringIn30Days,
      },
      revenue: {
        total: totalRevenue,
        last30Days: recentRevenue,
        averagePerMonth: recentRevenue, // Simplified for now
      },
      usage: {
        requestsLast24h,
        averagePerHour: Math.round(requestsLast24h / 24),
      },
      topKeys: topKeys.map(key => ({
        uid: key.uid,
        name: key.name,
        type: key.type,
        usageCount: key.usageCount,
        lastUsedAt: key.lastUsedAt,
        hasSubscription: !!key.subscription,
        isActive: key.isActive,
      })),
      recentActivity: recentAuditLogs.map(log => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt,
        apiKeyName: log.apiKey?.name,
        apiKeyType: log.apiKey?.type,
      })),
    });
  } catch (error) {
    console.error('[Admin Stats] Get error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
