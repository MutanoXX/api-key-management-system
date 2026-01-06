/**
 * POST /api/cron/maintenance
 * Endpoint to run maintenance tasks
 * This can be called by external cron jobs or scheduled tasks
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMaintenance } from '@/lib/api-keys/maintenance';

export async function POST(req: NextRequest) {
  try {
    // Check for authorization header (optional but recommended)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          {
            error: 'Unauthorized',
            code: 'UNAUTHORIZED',
          },
          { status: 401 }
        );
      }
    }

    // Run maintenance tasks
    const results = await runMaintenance();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('[Cron] Maintenance error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
