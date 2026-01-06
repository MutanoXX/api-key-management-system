/**
 * JSON Database Module
 * Substitui o Prisma para usar arquivos JSON
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname);

// Nomes dos arquivos
const FILES = {
  API_KEYS: 'api-keys.json',
  SUBSCRIPTIONS: 'subscriptions.json',
  PAYMENTS: 'payments.json',
  USAGE_LOGS: 'usage-logs.json',
  AUDIT_LOGS: 'audit-logs.json',
  JWT_BLACKLIST: 'jwt-blacklist.json',
  DB_INFO: 'db-info.json',
};

// Chaves secretas embutidas
const JWT_SECRET = 'api-keys-jwt-secret-2025-mutanox';
const CRON_SECRET = 'api-keys-cron-secret-2025-mutanox';

/**
 * Ler arquivo JSON
 */
async function readFile(filename) {
  const filePath = path.join(DB_PATH, filename);
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Se arquivo não existe, cria
      const emptyData = filename === 'subscriptions.json' ? {} : [];
      await fs.writeFile(filePath, JSON.stringify(emptyData, null, 2));
      return emptyData;
    }
    throw error;
  }
}

/**
 * Escrever arquivo JSON
 */
async function writeFile(filename, data) {
  const filePath = path.join(DB_PATH, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Ler todos os arquivos do banco
 */
export async function readDatabase() {
  return {
    apiKeys: await readFile(FILES.API_KEYS),
    subscriptions: await readFile(FILES.SUBSCRIPTIONS),
    payments: await readFile(FILES.PAYMENTS),
    usageLogs: await readFile(FILES.USAGE_LOGS),
    auditLogs: await readFile(FILES.AUDIT_LOGS),
    jwtBlacklist: await readFile(FILES.JWT_BLACKLIST),
  };
}

/**
 * Escrever arquivo específico
 */
export async function writeDatabaseFile(filename, data) {
  await writeFile(filename, data);
}

/**
 * ==========================================
 * API KEYS
 * ==========================================
 */

export async function createApiKey(data) {
  const apiKeys = await readFile(FILES.API_KEYS);
  const newKey = {
    id: crypto.randomUUID(),
    uid: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    usageCount: 0,
    isActive: true,
    ...data,
  };
  apiKeys.push(newKey);
  await writeFile(FILES.API_KEYS, apiKeys);
  return newKey;
}

export async function findApiKeyByUid(uid) {
  const apiKeys = await readFile(FILES.API_KEYS);
  return apiKeys.find(k => k.uid === uid);
}

export async function findApiKeyByKeyValue(keyValue) {
  const apiKeys = await readFile(FILES.API_KEYS);
  return apiKeys.find(k => k.keyValue === keyValue);
}

export async function findAllApiKeys() {
  return readFile(FILES.API_KEYS);
}

export async function updateApiKey(uid, updates) {
  const apiKeys = await readFile(FILES.API_KEYS);
  const index = apiKeys.findIndex(k => k.uid === uid);
  if (index === -1) return null;

  apiKeys[index] = {
    ...apiKeys[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(FILES.API_KEYS, apiKeys);
  return apiKeys[index];
}

export async function deleteApiKey(uid) {
  const apiKeys = await readFile(FILES.API_KEYS);
  const index = apiKeys.findIndex(k => k.uid === uid);
  if (index === -1) return null;

  // Remove subscriptions e pagamentos relacionados
  await deleteSubscriptionByApiKeyUid(uid);
  await deletePaymentsByApiKeyUid(uid);

  apiKeys.splice(index, 1);
  await writeFile(FILES.API_KEYS, apiKeys);
  return true;
}

export async function incrementApiKeyUsage(uid) {
  const apiKeys = await readFile(FILES.API_KEYS);
  const index = apiKeys.findIndex(k => k.uid === uid);
  if (index === -1) return null;

  apiKeys[index].usageCount = (apiKeys[index].usageCount || 0) + 1;
  apiKeys[index].lastUsedAt = new Date().toISOString();
  await writeFile(FILES.API_KEYS, apiKeys);
  return apiKeys[index];
}

/**
 * ==========================================
 * SUBSCRIPTIONS
 * ==========================================
 */

export async function createSubscription(data) {
  const subscriptions = await readFile(FILES.SUBSCRIPTIONS);
  const newSubscription = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    enabled: true,
    status: 'active',
    currency: 'BRL',
    autoRenew: false,
    ...data,
  };
  subscriptions[data.apiKeyUid] = newSubscription;
  await writeFile(FILES.SUBSCRIPTIONS, subscriptions);
  return newSubscription;
}

export async function findSubscriptionByApiKeyUid(apiKeyUid) {
  const subscriptions = await readFile(FILES.SUBSCRIPTIONS);
  return subscriptions[apiKeyUid] || null;
}

export async function updateSubscription(apiKeyUid, updates) {
  const subscriptions = await readFile(FILES.SUBSCRIPTIONS);
  if (!subscriptions[apiKeyUid]) return null;

  subscriptions[apiKeyUid] = {
    ...subscriptions[apiKeyUid],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(FILES.SUBSCRIPTIONS, subscriptions);
  return subscriptions[apiKeyUid];
}

export async function deleteSubscriptionByApiKeyUid(apiKeyUid) {
  const subscriptions = await readFile(FILES.SUBSCRIPTIONS);
  delete subscriptions[apiKeyUid];
  await writeFile(FILES.SUBSCRIPTIONS, subscriptions);
}

export async function findAllSubscriptions() {
  const subscriptions = await readFile(FILES.SUBSCRIPTIONS);
  return Object.entries(subscriptions).map(([apiKeyUid, sub]) => ({
    ...sub,
    apiKeyUid,
  }));
}

/**
 * ==========================================
 * PAYMENTS
 * ==========================================
 */

export async function createPayment(data) {
  const payments = await readFile(FILES.PAYMENTS);
  const newPayment = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    paymentDate: new Date().toISOString(),
    status: 'completed',
    method: 'manual',
    ...data,
  };
  payments.push(newPayment);
  await writeFile(FILES.PAYMENTS, payments);
  return newPayment;
}

export async function findPaymentsBySubscriptionId(subscriptionId) {
  const payments = await readFile(FILES.PAYMENTS);
  return payments.filter(p => p.subscriptionId === subscriptionId);
}

export async function deletePaymentsByApiKeyUid(apiKeyUid) {
  const subscriptions = await readFile(FILES.SUBSCRIPTIONS);
  const subscription = subscriptions[apiKeyUid];
  if (!subscription) return;

  const payments = await readFile(FILES.PAYMENTS);
  const filteredPayments = payments.filter(p => p.subscriptionId !== subscription.id);
  await writeFile(FILES.PAYMENTS, filteredPayments);
}

export async function findAllPayments() {
  return readFile(FILES.PAYMENTS);
}

/**
 * ==========================================
 * USAGE LOGS
 * ==========================================
 */

export async function createUsageLog(data) {
  const usageLogs = await readFile(FILES.USAGE_LOGS);
  const newLog = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...data,
  };
  usageLogs.push(newLog);

  // Manter apenas os últimos 1000 logs
  if (usageLogs.length > 1000) {
    usageLogs.splice(0, usageLogs.length - 1000);
  }

  await writeFile(FILES.USAGE_LOGS, usageLogs);
  return newLog;
}

export async function findUsageLogsByApiKeyUid(apiKeyUid, limit = 50) {
  const usageLogs = await readFile(FILES.USAGE_LOGS);
  return usageLogs
    .filter(l => l.apiKeyUid === apiKeyUid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

export async function findRecentUsageLogs(hours = 24) {
  const usageLogs = await readFile(FILES.USAGE_LOGS);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return usageLogs.filter(l => new Date(l.createdAt) >= cutoff);
}

/**
 * ==========================================
 * AUDIT LOGS
 * ==========================================
 */

export async function createAuditLog(data) {
  const auditLogs = await readFile(FILES.AUDIT_LOGS);
  const newLog = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...data,
  };
  auditLogs.push(newLog);

  // Manter apenas os últimos 500 logs
  if (auditLogs.length > 500) {
    auditLogs.splice(0, auditLogs.length - 500);
  }

  await writeFile(FILES.AUDIT_LOGS, auditLogs);
  return newLog;
}

export async function findRecentAuditLogs(limit = 10) {
  const auditLogs = await readFile(FILES.AUDIT_LOGS);
  const apiKeys = await readFile(FILES.API_KEYS);

  return auditLogs
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map(log => ({
      ...log,
      apiKey: apiKeys.find(k => k.uid === log.apiKeyUid) || null,
    }));
}

/**
 * ==========================================
 * JWT BLACKLIST
 * ==========================================
 */

export async function addToJwtBlacklist(token, expiresIn = 3600) {
  const blacklist = await readFile(FILES.JWT_BLACKLIST);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  blacklist.push({
    token,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  await writeFile(FILES.JWT_BLACKLIST, blacklist);
}

export async function isTokenBlacklisted(token) {
  const blacklist = await readFile(FILES.JWT_BLACKLIST);
  const now = new Date();

  // Limpar tokens expirados
  const validBlacklist = blacklist.filter(entry => new Date(entry.expiresAt) > now);
  if (validBlacklist.length !== blacklist.length) {
    await writeFile(FILES.JWT_BLACKLIST, validBlacklist);
  }

  return validBlacklist.some(entry => entry.token === token);
}

export async function cleanupExpiredBlacklistedTokens() {
  const blacklist = await readFile(FILES.JWT_BLACKLIST);
  const now = new Date();
  const validBlacklist = blacklist.filter(entry => new Date(entry.expiresAt) > now);

  if (validBlacklist.length !== blacklist.length) {
    await writeFile(FILES.JWT_BLACKLIST, validBlacklist);
    return blacklist.length - validBlacklist.length;
  }

  return 0;
}

/**
 * ==========================================
 * EXPORT CHAVES SECRETAS
 * ==========================================
 */

export { JWT_SECRET, CRON_SECRET };
