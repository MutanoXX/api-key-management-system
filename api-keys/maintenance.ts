/**
 * Subscription Expiration Checker
 * Runs periodically to check and update expired subscriptions
 * This can be run as a cron job or scheduled task
 */

import { db } from '@/lib/db';

/**
 * Check and update expired subscriptions
 */
export async function checkExpiredSubscriptions() {
  try {
    const now = new Date();

    // Find all active subscriptions that have expired
    const expiredSubscriptions = await db.subscription.findMany({
      where: {
        enabled: true,
        status: 'active',
        endDate: {
          lt: now,
        },
      },
      include: {
        apiKey: true,
      },
    });

    if (expiredSubscriptions.length === 0) {
      console.log('[Subscription Check] No expired subscriptions found');
      return {
        checked: 0,
        expired: 0,
        updated: 0,
      };
    }

    console.log(`[Subscription Check] Found ${expiredSubscriptions.length} expired subscriptions`);

    // Update each expired subscription
    let updatedCount = 0;
    for (const subscription of expiredSubscriptions) {
      // Update subscription status
      await db.subscription.update({
        where: { id: subscription.id },
        data: { status: 'expired' },
      });

      // Deactivate the associated API key
      await db.apiKey.update({
        where: { id: subscription.apiKeyId },
        data: { isActive: false },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          apiKeyId: subscription.apiKeyId,
          action: 'subscription_expired',
          details: JSON.stringify({
            endDate: subscription.endDate,
            autoRenew: subscription.autoRenew,
          }),
        },
      });

      updatedCount++;

      console.log(`[Subscription Check] Expired: ${subscription.apiKey.name} (${subscription.apiKey.uid})`);
    }

    console.log(`[Subscription Check] Updated ${updatedCount} subscriptions to expired status`);

    return {
      checked: expiredSubscriptions.length,
      expired: expiredSubscriptions.length,
      updated: updatedCount,
    };
  } catch (error) {
    console.error('[Subscription Check] Error:', error);
    throw error;
  }
}

/**
 * Check and auto-renew subscriptions if enabled
 */
export async function checkAutoRenewSubscriptions() {
  try {
    const now = new Date();

    // Find subscriptions that are about to expire (within 24 hours) and have auto-renew enabled
    const renewSubscriptions = await db.subscription.findMany({
      where: {
        enabled: true,
        autoRenew: true,
        status: 'active',
        endDate: {
          lte: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Next 24 hours
        },
      },
      include: {
        apiKey: true,
      },
    });

    if (renewSubscriptions.length === 0) {
      console.log('[Auto Renew] No subscriptions to auto-renew');
      return {
        checked: 0,
        renewed: 0,
      };
    }

    console.log(`[Auto Renew] Found ${renewSubscriptions.length} subscriptions to auto-renew`);

    let renewedCount = 0;
    for (const subscription of renewSubscriptions) {
      // Calculate new end date (extend by 30 days from current end date)
      const currentEndDate = new Date(subscription.endDate);
      const newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + 30);

      // Update subscription
      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          endDate: newEndDate,
          renewalDate: newEndDate,
        },
      });

      // Create payment history record
      await db.paymentHistory.create({
        data: {
          subscriptionId: subscription.id,
          amount: subscription.price,
          currency: subscription.currency,
          paymentDate: now,
          reference: `AUTO-RENEW-${Date.now()}`,
          method: 'auto_renew',
          status: 'completed',
        },
      });

      // Create audit log
      await db.auditLog.create({
        data: {
          apiKeyId: subscription.apiKeyId,
          action: 'subscription_auto_renewed',
          details: JSON.stringify({
            oldEndDate: subscription.endDate,
            newEndDate,
            amount: subscription.price,
          }),
        },
      });

      renewedCount++;

      console.log(`[Auto Renew] Auto-renewed: ${subscription.apiKey.name} (${subscription.apiKey.uid})`);
    }

    console.log(`[Auto Renew] Auto-renewed ${renewedCount} subscriptions`);

    return {
      checked: renewSubscriptions.length,
      renewed: renewedCount,
    };
  } catch (error) {
    console.error('[Auto Renew] Error:', error);
    throw error;
  }
}

/**
 * Clean up old JWT tokens from blacklist
 */
export async function cleanupOldTokens() {
  try {
    const now = new Date();

    // Delete expired tokens
    const result = await db.jwtBlacklist.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    console.log(`[Token Cleanup] Cleaned up ${result.count} expired tokens`);

    return {
      cleaned: result.count,
    };
  } catch (error) {
    console.error('[Token Cleanup] Error:', error);
    throw error;
  }
}

/**
 * Run all maintenance tasks
 */
export async function runMaintenance() {
  console.log('[Maintenance] Starting maintenance tasks...');
  console.log(`[Maintenance] Time: ${new Date().toISOString()}`);

  const results = {
    subscriptions: await checkExpiredSubscriptions(),
    autoRenew: await checkAutoRenewSubscriptions(),
    tokens: await cleanupOldTokens(),
  };

  console.log('[Maintenance] All tasks completed');
  console.log('[Maintenance] Results:', JSON.stringify(results, null, 2));

  return results;
}

// Run if called directly
if (import.meta.main) {
  runMaintenance()
    .then(() => {
      console.log('[Maintenance] Success');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Maintenance] Failed:', error);
      process.exit(1);
    });
}
