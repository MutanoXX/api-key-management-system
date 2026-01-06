import { PrismaClient } from '@prisma/client';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Prisma Client
const prisma = new PrismaClient();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

app.use(express.json({ limit: '10mb' }));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com fonts.googleapis.com; font-src 'self' fonts.gstatic.com cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';");
  next();
});

// Serve static files (dashboard)
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard.html')));

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function generateToken(payload) {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

function generateRefreshToken(payload) {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function isSubscriptionExpired(endDate) {
  return new Date() > new Date(endDate);
}

function calculateDaysRemaining(endDate) {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function maskApiKey(apiKey) {
  if (apiKey.length < 8) return '****';
  const start = apiKey.substring(0, 4);
  const end = apiKey.substring(apiKey.length - 4);
  return `${start}****${end}`;
}

// Rate limiting (in-memory)
const rateLimitStore = new Map();

function checkRateLimit(identifier, maxRequests, windowMs) {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.resetTime };
}

// Audit logging
async function createAuditLog(apiKeyId, action, details, ipAddress, userAgent) {
  try {
    await prisma.auditLog.create({
      data: {
        apiKeyId,
        action,
        details: JSON.stringify(details),
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error('[Audit Log] Error:', error);
  }
}

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

app.post('/api/admin/auth/validate', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required', code: 'MISSING_API_KEY' });
    }

    const keyRecord = await prisma.apiKey.findUnique({
      where: { keyValue: apiKey },
      include: { subscription: true },
    });

    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
    }

    if (!keyRecord.isActive) {
      return res.status(403).json({ error: 'API key is inactive', code: 'INACTIVE_API_KEY' });
    }

    if (keyRecord.type !== 'admin') {
      return res.status(403).json({ error: 'Admin API key required', code: 'NOT_ADMIN_KEY' });
    }

    if (keyRecord.subscription && keyRecord.subscription.enabled) {
      if (isSubscriptionExpired(keyRecord.subscription.endDate)) {
        await prisma.subscription.update({
          where: { id: keyRecord.subscription.id },
          data: { status: 'expired' },
        });
        return res.status(403).json({ error: 'Subscription expired', code: 'SUBSCRIPTION_EXPIRED' });
      }
    }

    const token = generateToken({ apiKeyId: keyRecord.id, apiKeyUid: keyRecord.uid, type: 'admin' });
    const refreshToken = generateRefreshToken({ apiKeyId: keyRecord.id, apiKeyUid: keyRecord.uid, type: 'refresh' });

    await createAuditLog(
      keyRecord.id,
      'admin_login',
      {},
      req.ip,
      req.headers['user-agent']
    );

    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
    });

    res.json({
      valid: true,
      token,
      refreshToken,
      expiresIn: 3600,
      apiKey: { uid: keyRecord.uid, name: keyRecord.name, type: keyRecord.type },
    });
  } catch (error) {
    console.error('[Auth] Error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// API KEYS ENDPOINTS
// ==========================================

app.get('/api/admin/keys', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required', code: 'MISSING_TOKEN' });
    }

    const decoded = verifyToken(authHeader.substring(7));
    if (!decoded || decoded.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const apiKeys = await prisma.apiKey.findMany({
      include: { subscription: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        uid: key.uid,
        keyValue: key.keyValue,
        name: key.name,
        type: key.type,
        isActive: key.isActive,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount,
        subscription: key.subscription
          ? {
              id: key.subscription.id,
              enabled: key.subscription.enabled,
              price: key.subscription.price,
              currency: key.subscription.currency,
              status: key.subscription.status,
              startDate: key.subscription.startDate,
              endDate: key.subscription.endDate,
              daysRemaining: calculateDaysRemaining(key.subscription.endDate),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error('[Keys] Error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/keys', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required', code: 'MISSING_TOKEN' });
    }

    const decoded = verifyToken(authHeader.substring(7));
    if (!decoded || decoded.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const { name, type = 'normal', subscription } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required', code: 'MISSING_NAME' });
    }

    const uid = crypto.randomUUID();
    const keyValue = `${name.replace(/\s+/g, '')}-${Math.random().toString(36).substring(2, 10)}`;

    const newKey = await prisma.apiKey.create({
      data: {
        uid,
        keyValue,
        name,
        type,
      },
    });

    if (subscription && subscription.enabled) {
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + (subscription.durationDays || 30));

      await prisma.subscription.create({
        data: {
          apiKeyId: newKey.id,
          enabled: true,
          price: subscription.price || 50,
          currency: subscription.currency || 'BRL',
          status: 'active',
          startDate,
          endDate,
          autoRenew: subscription.autoRenew || false,
        },
      });

      await prisma.paymentHistory.create({
        data: {
          subscriptionId: newKey.id,
          amount: subscription.price || 50,
          currency: subscription.currency || 'BRL',
          paymentDate: new Date(),
          reference: `SUB-${Date.now()}`,
          method: 'manual',
          status: 'completed',
        },
      });
    }

    await createAuditLog(newKey.id, 'create_api_key', { name, type }, req.ip, req.headers['user-agent']);

    res.status(201).json({
      success: true,
      apiKey: {
        uid: newKey.uid,
        keyValue: newKey.keyValue,
        name: newKey.name,
        type: newKey.type,
      },
    });
  } catch (error) {
    console.error('[Keys] Create error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/admin/keys/:uid', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required', code: 'MISSING_TOKEN' });
    }

    const decoded = verifyToken(authHeader.substring(7));
    if (!decoded || decoded.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const { uid } = req.params;

    await prisma.apiKey.delete({ where: { uid } });

    res.json({ success: true, message: 'API key deleted' });
  } catch (error) {
    console.error('[Keys] Delete error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// SUBSCRIPTION ENDPOINTS
// ==========================================

app.post('/api/admin/keys/:uid/subscription/activate', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required', code: 'MISSING_TOKEN' });
    }

    const decoded = verifyToken(authHeader.substring(7));
    if (!decoded || decoded.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const { uid } = req.params;
    const { price, durationDays = 30, autoRenew = false } = req.body;

    const apiKey = await prisma.apiKey.findUnique({ where: { uid } });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found', code: 'API_KEY_NOT_FOUND' });
    }

    const existingSubscription = await prisma.subscription.findUnique({
      where: { apiKeyId: apiKey.id },
    });

    if (existingSubscription && existingSubscription.enabled) {
      return res.status(400).json({ error: 'Subscription already exists', code: 'SUBSCRIPTION_EXISTS' });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    let subscription;
    if (existingSubscription) {
      subscription = await prisma.subscription.update({
        where: { apiKeyId: apiKey.id },
        data: {
          enabled: true,
          price,
          currency: 'BRL',
          status: 'active',
          startDate,
          endDate,
          autoRenew,
        },
      });
    } else {
      subscription = await prisma.subscription.create({
        data: {
          apiKeyId: apiKey.id,
          enabled: true,
          price,
          currency: 'BRL',
          status: 'active',
          startDate,
          endDate,
          autoRenew,
        },
      });
    }

    await prisma.paymentHistory.create({
      data: {
        subscriptionId: subscription.id,
        amount: price,
        currency: 'BRL',
        paymentDate: new Date(),
        reference: `SUB-${Date.now()}`,
        method: 'manual',
        status: 'completed',
      },
    });

    await createAuditLog(
      apiKey.id,
      'activate_subscription',
      { price, durationDays },
      req.ip,
      req.headers['user-agent']
    );

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        enabled: subscription.enabled,
        price: subscription.price,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        autoRenew: subscription.autoRenew,
      },
    });
  } catch (error) {
    console.error('[Subscription] Activate error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/keys/:uid/subscription/renew', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required', code: 'MISSING_TOKEN' });
    }

    const decoded = verifyToken(authHeader.substring(7));
    if (!decoded || decoded.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const { uid } = req.params;
    const { durationDays = 30, paymentReference, amount } = req.body;

    const apiKey = await prisma.apiKey.findUnique({
      where: { uid },
      include: { subscription: true },
    });

    if (!apiKey || !apiKey.subscription) {
      return res.status(404).json({ error: 'Subscription not found', code: 'SUBSCRIPTION_NOT_FOUND' });
    }

    let newEndDate = new Date(apiKey.subscription.endDate);
    if (isSubscriptionExpired(apiKey.subscription.endDate)) {
      newEndDate = new Date();
    }
    newEndDate.setDate(newEndDate.getDate() + durationDays);

    const updatedSubscription = await prisma.subscription.update({
      where: { id: apiKey.subscription.id },
      data: {
        endDate: newEndDate,
        status: 'active',
      },
    });

    await prisma.paymentHistory.create({
      data: {
        subscriptionId: updatedSubscription.id,
        amount: amount || apiKey.subscription.price,
        currency: 'BRL',
        paymentDate: new Date(),
        reference: paymentReference || `RENEW-${Date.now()}`,
        method: 'manual',
        status: 'completed',
      },
    });

    if (!apiKey.isActive) {
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { isActive: true },
      });
    }

    await createAuditLog(
      apiKey.id,
      'renew_subscription',
      { durationDays, newEndDate },
      req.ip,
      req.headers['user-agent']
    );

    res.json({
      success: true,
      subscription: {
        endDate: updatedSubscription.endDate,
        daysRemaining: calculateDaysRemaining(updatedSubscription.endDate),
      },
    });
  } catch (error) {
    console.error('[Subscription] Renew error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// STATS ENDPOINTS
// ==========================================

app.get('/api/admin/stats', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required', code: 'MISSING_TOKEN' });
    }

    const decoded = verifyToken(authHeader.substring(7));
    if (!decoded || decoded.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }

    const totalKeys = await prisma.apiKey.count();
    const activeKeys = await prisma.apiKey.count({ where: { isActive: true } });
    const adminKeys = await prisma.apiKey.count({ where: { type: 'admin' } });

    const allSubscriptions = await prisma.subscription.findMany({
      where: { enabled: true },
    });
    const activeSubscriptions = allSubscriptions.filter((s) => !isSubscriptionExpired(s.endDate)).length;
    const expiredSubscriptions = allSubscriptions.filter((s) => isSubscriptionExpired(s.endDate)).length;

    const allPayments = await prisma.paymentHistory.findMany({
      where: { status: 'completed' },
    });
    const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0);

    const recentActivity = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { apiKey: { select: { name: true, type: true } } },
    });

    res.json({
      success: true,
      timestamp: new Date(),
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
      },
      revenue: {
        total: totalRevenue,
        last30Days: totalRevenue,
      },
      recentActivity: recentActivity.map((log) => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt,
        apiKeyName: log.apiKey?.name,
        apiKeyType: log.apiKey?.type,
      })),
    });
  } catch (error) {
    console.error('[Stats] Error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// DASHBOARD ENDPOINT
// ==========================================

app.get('/api/dashboard/apikeys', (req, res) => {
  const dashboardPath = path.join(__dirname, 'dashboard.html');
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
  } else {
    res.status(404).json({ error: 'Dashboard not found' });
  }
});

// ==========================================
// MAINTENANCE ENDPOINT
// ==========================================

app.post('/api/cron/maintenance', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check expired subscriptions
    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        enabled: true,
        status: 'active',
        endDate: { lt: new Date() },
      },
      include: { apiKey: true },
    });

    for (const sub of expiredSubscriptions) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'expired' },
      });
      await prisma.apiKey.update({
        where: { id: sub.apiKeyId },
        data: { isActive: false },
      });
    }

    res.json({
      success: true,
      timestamp: new Date(),
      results: {
        expired: expiredSubscriptions.length,
      },
    });
  } catch (error) {
    console.error('[Cron] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log(`\n🚀 API Key Management System`);
  console.log(`📍 Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/api/dashboard/apikeys`);
  console.log(`🔑 Admin API Key: MutanoX3397`);
  console.log(`\nPress Ctrl+C to stop\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});
