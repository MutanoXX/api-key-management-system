/**
 * GET /api/admin/subscriptions/revenue
 * Get revenue report
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const groupBy = searchParams.get('groupBy') || 'date'; // 'date', 'month', 'key'

    // Default to last 30 days if no date range provided
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get payment history in date range
    const payments = await db.paymentHistory.findMany({
      where: {
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
        status: 'completed',
      },
      include: {
        subscription: {
          include: {
            apiKey: {
              select: {
                id: true,
                uid: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        paymentDate: 'desc',
      },
    });

    // Calculate total revenue
    const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);

    // Group payments based on groupBy parameter
    let groupedData: any[] = [];

    if (groupBy === 'date') {
      const dateGroups = new Map<string, { count: number; amount: number; currency: string }>();

      for (const payment of payments) {
        const dateKey = payment.paymentDate.toISOString().split('T')[0];
        if (!dateGroups.has(dateKey)) {
          dateGroups.set(dateKey, { count: 0, amount: 0, currency: payment.currency });
        }
        const group = dateGroups.get(dateKey)!;
        group.count++;
        group.amount += payment.amount;
      }

      groupedData = Array.from(dateGroups.entries()).map(([date, data]) => ({
        date,
        count: data.count,
        amount: data.amount,
        currency: data.currency,
      })).sort((a, b) => a.date.localeCompare(b.date));
    } else if (groupBy === 'month') {
      const monthGroups = new Map<string, { count: number; amount: number; currency: string }>();

      for (const payment of payments) {
        const date = new Date(payment.paymentDate);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthGroups.has(monthKey)) {
          monthGroups.set(monthKey, { count: 0, amount: 0, currency: payment.currency });
        }
        const group = monthGroups.get(monthKey)!;
        group.count++;
        group.amount += payment.amount;
      }

      groupedData = Array.from(monthGroups.entries()).map(([month, data]) => ({
        month,
        count: data.count,
        amount: data.amount,
        currency: data.currency,
      })).sort((a, b) => a.month.localeCompare(b.month));
    } else if (groupBy === 'key') {
      const keyGroups = new Map<string, { count: number; amount: number; currency: string; apiKeyName: string }>();

      for (const payment of payments) {
        const apiKeyId = payment.subscription.apiKeyId;
        if (!keyGroups.has(apiKeyId)) {
          keyGroups.set(apiKeyId, {
            count: 0,
            amount: 0,
            currency: payment.currency,
            apiKeyName: payment.subscription.apiKey.name,
          });
        }
        const group = keyGroups.get(apiKeyId)!;
        group.count++;
        group.amount += payment.amount;
      }

      groupedData = Array.from(keyGroups.entries()).map(([apiKeyId, data]) => ({
        apiKeyId,
        apiKeyName: data.apiKeyName,
        count: data.count,
        amount: data.amount,
        currency: data.currency,
      })).sort((a, b) => b.amount - a.amount);
    }

    // Get revenue by currency
    const currencyTotals = new Map<string, number>();
    for (const payment of payments) {
      const current = currencyTotals.get(payment.currency) || 0;
      currencyTotals.set(payment.currency, current + payment.amount);
    }

    return NextResponse.json({
      success: true,
      period: {
        startDate,
        endDate,
      },
      summary: {
        totalRevenue,
        totalPayments: payments.length,
        averagePaymentValue: payments.length > 0 ? totalRevenue / payments.length : 0,
        currencyBreakdown: Array.from(currencyTotals.entries()).map(([currency, amount]) => ({
          currency,
          amount,
        })),
      },
      groupedData,
      recentPayments: payments.slice(0, 10).map(payment => ({
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        paymentDate: payment.paymentDate,
        reference: payment.reference,
        method: payment.method,
        apiKeyName: payment.subscription.apiKey.name,
      })),
    });
  } catch (error) {
    console.error('[Admin Revenue] Report error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
