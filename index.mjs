// ==========================================
// API KEY MANAGEMENT SYSTEM - MAIN SERVER (ES Module)
// ==========================================
// Pure ES Module version for DISCLOUD compatibility
// No require() used anywhere - only imports

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Importar logger colorido
import { logger } from './logger.js';

// Importar módulo de banco de dados JSON
import * as db from './database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

app.use(express.json({ limit: '10mb' }));

// Security headers middleware
app.use((req, res, next) => {
  logger.security('Headers Applied', `${req.method} ${req.path}`);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com fonts.googleapis.com; font-src 'self' fonts.gstatic.com cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';");
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  logger.request(req);

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.response(res, duration);
  });

  next();
});

// ==========================================
// JWT FUNCTIONS
// ==========================================

import jwt from 'jsonwebtoken';

function generateToken(payload, expiresIn = '1h') {
  return jwt.sign(payload, db.JWT_SECRET, { expiresIn });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, db.JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, db.JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

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
async function createAuditLog(apiKeyUid, action, details, ipAddress, userAgent) {
  try {
    logger.db('Audit Log', `Action: ${action}, API Key: ${apiKeyUid}`);
    await db.createAuditLog({
      apiKeyUid,
      action,
      details: JSON.stringify(details),
      ipAddress,
      userAgent,
    });
  } catch (error) {
    logger.error('Audit Log', 'Failed to create audit log', error.message);
  }
}

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required', code: 'MISSING_TOKEN' });
  }

  const token = authHeader.substring(7);

  // Verificar se está na blacklist
  const isBlacklisted = await db.isTokenBlacklisted(token);
  if (isBlacklisted) {
    return res.status(401).json({ error: 'Token is blacklisted', code: 'BLACKLISTED_TOKEN' });
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.type !== 'admin') {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }

  req.admin = decoded;
  next();
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

    const keyRecord = await db.findApiKeyByKeyValue(apiKey);

    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
    }

    if (!keyRecord.isActive) {
      return res.status(403).json({ error: 'API key is inactive', code: 'INACTIVE_API_KEY' });
    }

    if (keyRecord.type !== 'admin') {
      return res.status(403).json({ error: 'Admin API key required', code: 'NOT_ADMIN_KEY' });
    }

    const subscription = await db.findSubscriptionByApiKeyUid(keyRecord.uid);
    if (subscription && subscription.enabled) {
      if (isSubscriptionExpired(subscription.endDate)) {
        await db.updateSubscription(keyRecord.uid, { status: 'expired' });
        return res.status(403).json({ error: 'Subscription expired', code: 'SUBSCRIPTION_EXPIRED' });
      }
    }

    const token = generateToken({ apiKeyUid: keyRecord.uid, type: 'admin' });
    const refreshToken = generateRefreshToken({ apiKeyUid: keyRecord.uid, type: 'refresh' });

    await createAuditLog(
      keyRecord.uid,
      'admin_login',
      {},
      req.ip,
      req.headers['user-agent']
    );

    await db.incrementApiKeyUsage(keyRecord.uid);

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

app.get('/api/admin/auth/refresh', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Refresh token is required', code: 'MISSING_REFRESH_TOKEN' });
    }

    const token = authHeader.substring(7);
    const isBlacklisted = await db.isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Refresh token is blacklisted', code: 'BLACKLISTED_TOKEN' });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }

    const apiKey = await db.findApiKeyByUid(decoded.apiKeyUid);
    if (!apiKey || !apiKey.isActive || apiKey.type !== 'admin') {
      return res.status(403).json({ error: 'Invalid admin credentials', code: 'INVALID_ADMIN' });
    }

    const subscription = await db.findSubscriptionByApiKeyUid(apiKey.uid);
    if (subscription && subscription.enabled) {
      if (isSubscriptionExpired(subscription.endDate)) {
        return res.status(403).json({ error: 'Subscription expired', code: 'SUBSCRIPTION_EXPIRED' });
      }
    }

    const newToken = generateToken({ apiKeyUid: apiKey.uid, type: 'admin' });
    const newRefreshToken = generateRefreshToken({ apiKeyUid: apiKey.uid, type: 'refresh' });

    await db.addToJwtBlacklist(token, 7 * 24 * 60 * 60);

    res.json({
      valid: true,
      token: newToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('[Auth] Refresh error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/admin/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token is required', code: 'MISSING_TOKEN' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      await db.addToJwtBlacklist(token, 3600);
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// API KEYS ENDPOINTS
// ==========================================

app.get('/api/admin/keys', authenticateAdmin, async (req, res) => {
  try {
    const apiKeys = await db.findAllApiKeys();
    const subscriptions = await db.findAllSubscriptions();

    const keysWithSubscriptions = await Promise.all(
      apiKeys.map(async (key) => {
        const subscription = subscriptions.find(s => s.apiKeyUid === key.uid);
        return {
          id: key.id,
          uid: key.uid,
          keyValue: key.keyValue,
          name: key.name,
          type: key.type,
          isActive: key.isActive,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          usageCount: key.usageCount,
          subscription: subscription
            ? {
                id: subscription.id,
                enabled: subscription.enabled,
                price: subscription.price,
                currency: subscription.currency,
                status: subscription.status,
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                daysRemaining: calculateDaysRemaining(subscription.endDate),
              }
            : null,
        };
      })
    );

    res.json({
      success: true,
      apiKeys: keysWithSubscriptions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    });
  } catch (error) {
    console.error('[Keys] Error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/keys/:uid', authenticateAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const apiKey = await db.findApiKeyByUid(uid);

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found', code: 'API_KEY_NOT_FOUND' });
    }

    const subscription = await db.findSubscriptionByApiKeyUid(uid);
    const usageLogs = await db.findUsageLogsByApiKeyUid(uid, 50);
    const auditLogs = await db.findRecentAuditLogs(10);
    const filteredAuditLogs = auditLogs.filter(log => log.apiKeyUid === uid);

    res.json({
      success: true,
      apiKey: {
        ...apiKey,
        subscription,
        usageLogs,
        auditLogs: filteredAuditLogs,
      },
    });
  } catch (error) {
    console.error('[Keys] Get error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/keys', authenticateAdmin, async (req, res) => {
  try {
    const { name, type = 'normal', subscription } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required', code: 'MISSING_NAME' });
    }

    // Generate API key
    const keyValue = `${name.replace(/\s+/g, '')}-${Math.random().toString(36).substring(2, 10)}`;

    const newKey = await db.createApiKey({
      keyValue,
      name,
      type,
    });

    if (subscription && subscription.enabled) {
      const startDate = new Date().toISOString();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (subscription.durationDays || 30));

      await db.createSubscription({
        apiKeyUid: newKey.uid,
        enabled: true,
        price: subscription.price || 50,
        currency: subscription.currency || 'BRL',
        status: 'active',
        startDate,
        endDate: endDate.toISOString(),
        autoRenew: subscription.autoRenew || false,
      });

      const createdSubscription = await db.findSubscriptionByApiKeyUid(newKey.uid);
      if (createdSubscription) {
        await db.createPayment({
          subscriptionId: createdSubscription.id,
          apiKeyUid: newKey.uid,
          amount: subscription.price || 50,
          currency: subscription.currency || 'BRL',
          paymentDate: new Date().toISOString(),
          reference: `SUB-${Date.now()}`,
          method: 'manual',
          status: 'completed',
        });
      }
    }

    await createAuditLog(newKey.uid, 'create_api_key', { name, type }, req.ip, req.headers['user-agent']);

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

app.put('/api/admin/keys/:uid', authenticateAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const { name, isActive, rateLimit, rateLimitWindow } = req.body;

    const existingKey = await db.findApiKeyByUid(uid);
    if (!existingKey) {
      return res.status(404).json({ error: 'API key not found', code: 'API_KEY_NOT_FOUND' });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (isActive !== undefined) updates.isActive = isActive;
    if (rateLimit !== undefined) updates.rateLimit = rateLimit;
    if (rateLimitWindow !== undefined) updates.rateLimitWindow = rateLimitWindow;

    const updatedKey = await db.updateApiKey(uid, updates);

    await createAuditLog(
      uid,
      'update_api_key',
      { updates },
      req.ip,
      req.headers['user-agent']
    );

    res.json({
      success: true,
      apiKey: {
        id: updatedKey.id,
        uid: updatedKey.uid,
        name: updatedKey.name,
        type: updatedKey.type,
        isActive: updatedKey.isActive,
      },
    });
  } catch (error) {
    console.error('[Keys] Update error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.delete('/api/admin/keys/:uid', authenticateAdmin, async (req, res) => {
  try {
    const { uid } = req.params;

    await db.deleteApiKey(uid);

    res.json({ success: true, message: 'API key deleted' });
  } catch (error) {
    console.error('[Keys] Delete error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// SUBSCRIPTION ENDPOINTS
// ==========================================

app.post('/api/admin/keys/:uid/subscription/activate', authenticateAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const { price, durationDays = 30, autoRenew = false } = req.body;

    const apiKey = await db.findApiKeyByUid(uid);
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found', code: 'API_KEY_NOT_FOUND' });
    }

    const existingSubscription = await db.findSubscriptionByApiKeyUid(uid);

    if (existingSubscription && existingSubscription.enabled) {
      return res.status(400).json({ error: 'Subscription already exists', code: 'SUBSCRIPTION_EXISTS' });
    }

    const startDate = new Date().toISOString();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    let subscription;
    if (existingSubscription) {
      subscription = await db.updateSubscription(uid, {
        enabled: true,
        price,
        currency: 'BRL',
        status: 'active',
        startDate,
        endDate: endDate.toISOString(),
        autoRenew,
      });
    } else {
      subscription = await db.createSubscription({
        apiKeyUid: uid,
        enabled: true,
        price,
        currency: 'BRL',
        status: 'active',
        startDate,
        endDate: endDate.toISOString(),
        autoRenew,
      });
    }

    await db.createPayment({
      subscriptionId: subscription.id,
      apiKeyUid: uid,
      amount: price,
      currency: 'BRL',
      paymentDate: new Date().toISOString(),
      reference: `SUB-${Date.now()}`,
      method: 'manual',
      status: 'completed',
    });

    await createAuditLog(
      uid,
      'activate_subscription',
      { price, durationDays, autoRenew },
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

app.post('/api/admin/keys/:uid/subscription/renew', authenticateAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const { durationDays = 30, paymentReference, amount } = req.body;

    const apiKey = await db.findApiKeyByUid(uid);
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found', code: 'API_KEY_NOT_FOUND' });
    }

    const subscription = await db.findSubscriptionByApiKeyUid(uid);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found', code: 'SUBSCRIPTION_NOT_FOUND' });
    }

    let currentEndDate = new Date(subscription.endDate);
    if (isSubscriptionExpired(subscription.endDate)) {
      currentEndDate = new Date();
    }
    
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + durationDays);

    const updatedSubscription = await db.updateSubscription(uid, {
      endDate: newEndDate.toISOString(),
      status: 'active',
    });

    await db.createPayment({
      subscriptionId: subscription.id,
      apiKeyUid: uid,
      amount: amount || subscription.price,
      currency: subscription.currency || 'BRL',
      paymentDate: new Date().toISOString(),
      reference: paymentReference || `RENEW-${Date.now()}`,
      method: 'manual',
      status: 'completed',
    });

    if (!apiKey.isActive) {
      await db.updateApiKey(uid, { isActive: true });
    }

    await createAuditLog(
      uid,
      'renew_subscription',
      { durationDays, newEndDate: newEndDate.toISOString() },
      req.ip,
      req.headers['user-agent']
    );

    res.json({
      success: true,
      subscription: {
        endDate: updatedSubscription.endDate,
        daysRemaining: calculateDaysRemaining(updatedSubscription.endDate),
      },
      message: 'Subscription renewed successfully',
    });
  } catch (error) {
    console.error('[Subscription] Renew error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.post('/api/admin/keys/:uid/subscription/cancel', authenticateAdmin, async (req, res) => {
  try {
    const { uid } = req.params;

    const subscription = await db.findSubscriptionByApiKeyUid(uid);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found', code: 'SUBSCRIPTION_NOT_FOUND' });
    }

    if (!subscription.enabled) {
      return res.status(400).json({ error: 'Subscription is not active', code: 'SUBSCRIPTION_NOT_ACTIVE' });
    }

    await db.updateSubscription(uid, {
      autoRenew: false,
      status: 'cancelled',
    });

    await createAuditLog(
      uid,
      'cancel_subscription',
      { endDate: subscription.endDate },
      req.ip,
      req.headers['user-agent']
    );

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        enabled: subscription.enabled,
        status: 'cancelled',
        endDate: subscription.endDate,
      },
      message: 'Subscription cancelled successfully',
      note: 'The subscription will expire naturally at end date',
    });
  } catch (error) {
    console.error('[Subscription] Cancel error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// SUBSCRIPTIONS LIST ENDPOINT
// ==========================================

app.get('/api/admin/subscriptions/expiring', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const status = req.query.status || 'all';

    const subscriptions = await db.findAllSubscriptions();
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    let filteredSubscriptions = subscriptions;

    if (status === 'expiring') {
      filteredSubscriptions = subscriptions.filter(
        s => !isSubscriptionExpired(s.endDate) && new Date(s.endDate) <= thresholdDate
      );
    } else if (status === 'expired') {
      filteredSubscriptions = subscriptions.filter(s => isSubscriptionExpired(s.endDate));
    }

    const resultSubscriptions = [];
    for (const sub of filteredSubscriptions) {
      const apiKey = await db.findApiKeyByUid(sub.apiKeyUid);
      if (apiKey) {
        const expired = isSubscriptionExpired(sub.endDate);
        const daysRemaining = calculateDaysRemaining(sub.endDate);

        resultSubscriptions.push({
          id: sub.id,
          apiKey: {
            uid: apiKey.uid,
            name: apiKey.name,
            type: apiKey.type,
            keyValue: apiKey.keyValue,
          },
          enabled: sub.enabled,
          price: sub.price,
          currency: sub.currency,
          status: expired ? 'expired' : (daysRemaining <= days ? 'expiring' : 'active'),
          startDate: sub.startDate,
          endDate: sub.endDate,
          renewalDate: sub.renewalDate,
          autoRenew: sub.autoRenew,
          daysRemaining: Math.max(0, daysRemaining),
        });
      }
    }

    res.json({
      success: true,
      subscriptions: resultSubscriptions.sort((a, b) => new Date(a.endDate) - new Date(b.endDate)),
      summary: {
        total: subscriptions.length,
        active: subscriptions.filter(s => !isSubscriptionExpired(s.endDate)).length,
        expired: subscriptions.filter(s => isSubscriptionExpired(s.endDate)).length,
        expiring: subscriptions.filter(
          s => !isSubscriptionExpired(s.endDate) && new Date(s.endDate) <= thresholdDate
        ).length,
      },
    });
  } catch (error) {
    console.error('[Subscriptions] Error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

app.get('/api/admin/subscriptions/revenue', async (req, res) => {
  try {
    const startDateStr = req.query.startDate;
    const endDateStr = req.query.endDate;
    const groupBy = req.query.groupBy || 'date';

    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr ? new Date(startDateStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const payments = await db.findAllPayments();
    const filteredPayments = payments.filter(
      p => p.status === 'completed' && new Date(p.paymentDate) >= startDate && new Date(p.paymentDate) <= endDate
    );

    const totalRevenue = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

    // Group payments
    let groupedData = [];
    if (groupBy === 'date') {
      const dateGroups = new Map();
      for (const payment of filteredPayments) {
        const dateKey = payment.paymentDate.split('T')[0];
        if (!dateGroups.has(dateKey)) {
          dateGroups.set(dateKey, { count: 0, amount: 0, currency: payment.currency });
        }
        const group = dateGroups.get(dateKey);
        group.count++;
        group.amount += payment.amount;
      }
      groupedData = Array.from(dateGroups.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    // Get recent payments
    const recentPayments = filteredPayments
      .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
      .slice(0, 10);

    // Add apiKey names
    const paymentsWithNames = await Promise.all(
      recentPayments.map(async (payment) => {
        const apiKey = await db.findApiKeyByUid(payment.apiKeyUid);
        return {
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          paymentDate: payment.paymentDate,
          reference: payment.reference,
          method: payment.method,
          apiKeyName: apiKey?.name || 'Unknown',
        };
      })
    );

    res.json({
      success: true,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary: {
        totalRevenue,
        totalPayments: filteredPayments.length,
        averagePaymentValue: filteredPayments.length > 0 ? totalRevenue / filteredPayments.length : 0,
      },
      groupedData,
      recentPayments: paymentsWithNames,
    });
  } catch (error) {
    console.error('[Revenue] Error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// STATS ENDPOINTS
// ==========================================

app.get('/api/admin/stats', async (req, res) => {
  try {
    const apiKeys = await db.findAllApiKeys();
    const subscriptions = await db.findAllSubscriptions();
    const payments = await db.findAllPayments();
    const recentUsageLogs = await db.findRecentUsageLogs(24);
    const recentAuditLogs = await db.findRecentAuditLogs(10);

    const totalKeys = apiKeys.length;
    const activeKeys = apiKeys.filter(k => k.isActive).length;
    const adminKeys = apiKeys.filter(k => k.type === 'admin').length;

    const activeSubscriptions = subscriptions.filter(s => !isSubscriptionExpired(s.endDate)).length;
    const expiredSubscriptions = subscriptions.filter(s => isSubscriptionExpired(s.endDate)).length;

    const totalRevenue = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);

    const requestsLast24h = recentUsageLogs.length;

    // Top keys
    const topKeys = [...apiKeys]
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 10);

    const recentActivity = recentAuditLogs.map(log => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      apiKeyName: log.apiKey?.name,
      apiKeyType: log.apiKey?.type,
    }));

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      overview: {
        totalKeys,
        activeKeys,
        inactiveKeys: totalKeys - activeKeys,
        adminKeys,
        normalKeys: totalKeys - adminKeys,
      },
      subscriptions: {
        total: subscriptions.length,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
      },
      revenue: {
        total: totalRevenue,
        last30Days: totalRevenue,
      },
      usage: {
        requestsLast24h,
        averagePerHour: Math.round(requestsLast24h / 24),
      },
      topKeys: topKeys.map(key => {
        const subscription = subscriptions.find(s => s.apiKeyUid === key.uid);
        return {
          uid: key.uid,
          name: key.name,
          type: key.type,
          usageCount: key.usageCount || 0,
          lastUsedAt: key.lastUsedAt,
          hasSubscription: !!subscription,
          isActive: key.isActive,
        };
      }),
      recentActivity,
    });
  } catch (error) {
    console.error('[Stats] Error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// DASHBOARD ENDPOINT
// ==========================================

app.get('/api/dashboard/apikeys', async (req, res) => {
  const dashboardPath = path.join(__dirname, 'dashboard.html');
  try {
    const exists = await fs.access(dashboardPath).then(() => true).catch(() => false);
    if (exists) {
      res.sendFile(dashboardPath);
    } else {
      res.status(404).json({ error: 'Dashboard not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ==========================================
// MAINTENANCE ENDPOINT
// ==========================================

app.post('/api/cron/maintenance', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${db.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check expired subscriptions
    const subscriptions = await db.findAllSubscriptions();
    const apiKeys = await db.findAllApiKeys();
    let expiredCount = 0;

    for (const sub of subscriptions) {
      if (sub.enabled && sub.status === 'active' && isSubscriptionExpired(sub.endDate)) {
        await db.updateSubscription(sub.apiKeyUid, { status: 'expired' });
        
        const apiKey = apiKeys.find(k => k.uid === sub.apiKeyUid);
        if (apiKey) {
          await db.updateApiKey(sub.apiKeyUid, { isActive: false });
        }
        expiredCount++;
      }
    }

    // Clean up blacklisted tokens
    const cleanedTokens = await db.cleanupExpiredBlacklistedTokens();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        expiredSubscriptions: expiredCount,
        cleanedTokens,
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
    database: 'json',
  });
});

// ==========================================
// START SERVER
// ==========================================

// Display startup banner
logger.banner(
  'API KEY MANAGEMENT SYSTEM',
  'Complete System with Dashboard',
  '1.0.0'
);

// Server configuration info
logger.section('📡 Server Configuration');
logger.table(
  ['Setting', 'Value'],
  [
    { Setting: 'Host', Value: HOST },
    { Setting: 'Port', Value: PORT },
    { Setting: 'URL', Value: `http://${HOST}:${PORT}` },
    { Setting: 'Dashboard', Value: `/api/dashboard/apikeys` },
    { Setting: 'Admin Key', Value: 'MutanoX3397' },
    { Setting: 'Database', Value: 'JSON files' },
    { Setting: 'Module', Value: 'ES Module' },
  ]
);

// Start listening
app.listen(PORT, HOST, () => {
  logger.success('SERVER', `Server started successfully on ${HOST}:${PORT}`);
  logger.section('🌐 Available Endpoints');
  logger.list([
    `GET  /api/health - Health check`,
    `POST /api/admin/auth/validate - Admin authentication`,
    `GET  /api/admin/auth/refresh - Refresh token`,
    `GET  /api/dashboard/apikeys - Dashboard UI`,
    `GET  /api/admin/keys - List all API keys`,
    `POST /api/admin/keys - Create new API key`,
    `GET  /api/admin/stats - System statistics`,
    `POST /api/cron/maintenance - Maintenance task`,
  ], '    ');
  console.log('');
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.warning('SERVER', `${signal} signal received: shutting down gracefully`);
  logger.info('SERVER', 'Closing HTTP connections...');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('SERVER', 'Uncaught Exception', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('SERVER', 'Unhandled Rejection at Promise', reason);
  process.exit(1);
});
