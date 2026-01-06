/**
 * GET /api/dashboard/apikeys
 * Serves the dashboard HTML file
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(req: NextRequest) {
  try {
    // Read the dashboard HTML file
    const filePath = join(process.cwd(), 'public', 'dashboard.html');
    const html = readFileSync(filePath, 'utf-8');

    // Return the HTML with appropriate headers
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com fonts.googleapis.com; font-src 'self' fonts.gstatic.com cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';",
      },
    });
  } catch (error) {
    console.error('[Dashboard] Serve error:', error);
    return NextResponse.json(
      {
        error: 'Dashboard not found',
        code: 'DASHBOARD_NOT_FOUND',
      },
      { status: 404 }
    );
  }
}
