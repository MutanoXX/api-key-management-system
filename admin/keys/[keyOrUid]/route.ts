/**
 * GET /api/admin/keys/[keyOrUid]
 * Get API key details
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAdminAuth, withSecurity } from '@/lib/middleware';

export async function GET(
  req: NextRequest,
  { params }: { params: { keyOrUid: string } }
) {
  try {
    const { keyOrUid } = params;

    // Find API key by UID
    const apiKey = await db.apiKey.findUnique({
      where: { uid: keyOrUid },
      include: {
        subscription: {
          include: {
            paymentHistory: {
              orderBy: { paymentDate: 'desc' },
            },
          },
        },
        usageLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
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

    return NextResponse.json({
      success: true,
      apiKey: {
        id: apiKey.id,
        uid: apiKey.uid,
        keyValue: apiKey.keyValue,
        name: apiKey.name,
        type: apiKey.type,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
        lastUsedAt: apiKey.lastUsedAt,
        usageCount: apiKey.usageCount,
        rateLimit: apiKey.rateLimit,
        rateLimitWindow: apiKey.rateLimitWindow,
        subscription: apiKey.subscription,
        usageLogs: apiKey.usageLogs,
        auditLogs: apiKey.auditLogs,
      },
    });
  } catch (error) {
    console.error('[Admin Keys] Get error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/keys/[keyOrUid]
 * Update API key
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: { keyOrUid: string } }
) {
  try {
    const { keyOrUid } = params;
    const body = await req.json();
    const { name, isActive, rateLimit, rateLimitWindow } = body;

    // Find API key
    const existingKey = await db.apiKey.findUnique({
      where: { uid: keyOrUid },
    });

    if (!existingKey) {
      return NextResponse.json(
        {
          error: 'API key not found',
          code: 'API_KEY_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // Update API key
    const updatedKey = await db.apiKey.update({
      where: { uid: keyOrUid },
      data: {
        ...(name && { name }),
        ...(isActive !== undefined && { isActive }),
        ...(rateLimit !== undefined && { rateLimit }),
        ...(rateLimitWindow !== undefined && { rateLimitWindow }),
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        apiKeyId: updatedKey.id,
        action: 'update_api_key',
        details: JSON.stringify({ changes: { name, isActive, rateLimit, rateLimitWindow } }),
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      apiKey: {
        id: updatedKey.id,
        uid: updatedKey.uid,
        keyValue: updatedKey.keyValue,
        name: updatedKey.name,
        type: updatedKey.type,
        isActive: updatedKey.isActive,
        createdAt: updatedKey.createdAt,
        updatedAt: updatedKey.updatedAt,
        rateLimit: updatedKey.rateLimit,
        rateLimitWindow: updatedKey.rateLimitWindow,
      },
    });
  } catch (error) {
    console.error('[Admin Keys] Update error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/keys/[keyOrUid]
 * Delete API key
 */

export async function DELETE(
  req: NextRequest,
  { params }: { params: { keyOrUid: string } }
) {
  try {
    const { keyOrUid } = params;

    // Find API key
    const existingKey = await db.apiKey.findUnique({
      where: { uid: keyOrUid },
    });

    if (!existingKey) {
      return NextResponse.json(
        {
          error: 'API key not found',
          code: 'API_KEY_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // Delete API key (subscription and related records will be cascade deleted)
    await db.apiKey.delete({
      where: { uid: keyOrUid },
    });

    // Create audit log (note: this will be deleted along with the key)
    // In a real system, you might want to keep this in a separate audit table
    console.log(`[Admin Keys] Deleted API key: ${keyOrUid}`);

    return NextResponse.json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error) {
    console.error('[Admin Keys] Delete error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
