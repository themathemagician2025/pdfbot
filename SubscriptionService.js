const BaseService = require('./BaseService');
const Subscription = require('../models/Subscription');
const AdminAuditService = require('./AdminAuditService');
const User = require('../models/User');
const { getDb } = require('../server/lib/db');

class SubscriptionService extends BaseService {
  constructor() {
    super(Subscription);
    this.adminAuditService = new AdminAuditService();
  }

  /**
   * Check if a user (by phone number) has active subscription access
   * @param {string} phone - Phone number (normalized)
   * @returns {Promise<{allowed: boolean, reason?: string, expiresAt?: Date}>}
   */
  async hasAccess(phone) {
    try {
      // Normalize phone (remove non-digits for lookup)
      const normalizedPhone = phone.replace(/\D/g, '');
      
      // Find user by phone
      const user = await User.query()
        .where('phone', normalizedPhone)
        .first();

      if (!user) {
        return { allowed: false, reason: 'user_not_found' };
      }

      if (user.is_blocked) {
        return { allowed: false, reason: 'user_blocked' };
      }

      // Check for active subscription
      const now = new Date();
      const activeSubscriptions = await this.model.query()
        .where('user_id', user.id)
        .where('status', 'active')
        .where('expires_at', '>', now.toISOString())
        .orderBy('expires_at', 'desc');

      if (activeSubscriptions.length > 0) {
        const latest = activeSubscriptions[0];
        return {
          allowed: true,
          expiresAt: new Date(latest.expires_at),
          subscription: latest
        };
      }

      // Check if trial is available
      if (!user.trial_used) {
        return { allowed: false, reason: 'trial_available' };
      }

      return { allowed: false, reason: 'subscription_required' };
    } catch (error) {
      console.error('[SubscriptionService] hasAccess error:', error);
      return { allowed: false, reason: 'check_failed' };
    }
  }

  async createOrExtendSubscription(userId, planType = 'weekly', trx = null) {
    const query = trx ? this.model.query(trx) : this.model.query();
    
    // Check for existing active subscription
    const existingSubscription = await query
      .where('user_id', userId)
      .where('status', 'active')
      .first();

    const now = new Date();
    let expiryDate = new Date();
    
    // Set expiry date based on plan type
    switch (planType) {
      case 'trial':
        expiryDate.setHours(now.getHours() + 1); // 1 hour trial
        break;
      case 'weekly':
        expiryDate.setDate(now.getDate() + 7); // 1 week
        break;
      case 'monthly':
        expiryDate.setMonth(now.getMonth() + 1); // 1 month
        break;
      case 'yearly':
        expiryDate.setFullYear(now.getFullYear() + 1); // 1 year
        break;
      default:
        throw new Error(`Invalid plan type: ${planType}`);
    }

    if (existingSubscription) {
      // Extend existing subscription
      return this.extendSubscription(existingSubscription.id, expiryDate, trx);
    } else {
      // Create new subscription
      return query.insert({
        user_id: userId,
        status: 'active',
        plan_type: planType,
        started_at: now.toISOString(),
        expires_at: expiryDate.toISOString(),
        auto_renew: planType !== 'trial', // Auto-renew for non-trial subscriptions
      });
    }
  }

  async extendSubscription(subscriptionId, newExpiryDate, trx = null) {
    const query = trx ? this.model.query(trx) : this.model.query();
    
    return query
      .patchAndFetchById(subscriptionId, {
        expires_at: newExpiryDate.toISOString(),
        status: 'active',
        updated_at: new Date().toISOString(),
      });
  }

  async cancelSubscription(subscriptionId, adminId, reason = '') {
    const trx = await this.transaction();
    try {
      const subscription = await this.model.query(trx)
        .patchAndFetchById(subscriptionId, {
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        });

      // Log the cancellation
      if (adminId) {
        await this.adminAuditService.logAction(
          adminId,
          'subscription_cancel',
          'subscription',
          subscriptionId,
          '0.0.0.0', // IP address should be passed from the request
          'system',   // User agent should be passed from the request
          { reason }
        );
      }

      await trx.commit();
      return subscription;
    } catch (error) {
      await trx.rollback();
      console.error('Error cancelling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  async getActiveSubscriptions(userId) {
    return this.model.query()
      .where('user_id', userId)
      .where('status', 'active')
      .where('expires_at', '>', new Date().toISOString())
      .orderBy('expires_at', 'desc');
  }

  async getExpiringSubscriptions(days = 3) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    
    return this.model.query()
      .where('status', 'active')
      .where('expires_at', '<=', date.toISOString())
      .where('expires_at', '>=', new Date().toISOString())
      .withGraphFetched('user')
      .orderBy('expires_at', 'asc');
  }
}

/**
 * Additional interface required by bot commands and routes
 * - hasAccess(phone) already implemented above using models (exported below)
 * - startTrial(phone): transactional using knex via getDb
 * - createOrExtendSubscriptionForPayment(phone, planSlug, providerInfo): transactional/idempotent
 */

async function startTrial(phone) {
  const db = getDb();
  return await db.transaction(async trx => {
    // find or create user
    let user = await trx('users').where({ phone }).first();
    if (!user) {
      const [uid] = await trx('users').insert({ phone, created_at: new Date() }).returning('id');
      user = { id: uid?.id || uid };
    }

    // determine trial eligibility
    let hasTrialCol = false;
    try {
      const info = await trx.raw("SELECT column_name FROM information_schema.columns WHERE table_name='users' and column_name='trial_used'");
      hasTrialCol = !!(info && info.rows && info.rows.length);
    } catch (e) {}

    if (hasTrialCol) {
      const freshUser = await trx('users').where({ id: user.id }).first();
      if (freshUser?.trial_used) return { ok: false, error: 'already_used' };
    } else {
      const priorSub = await trx('subscriptions').where({ user_id: user.id }).first();
      const priorSess = await trx('sessions').where({ user_id: user.id }).first();
      if (priorSub || priorSess) return { ok: false, error: 'already_used' };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
    const code = 'S-T' + Math.random().toString(36).substr(2, 6).toUpperCase();

    await trx('sessions').insert({ user_id: user.id, code, kind: 'trial', expires_at: expiresAt, created_at: now });
    if (hasTrialCol) {
      await trx('users').where({ id: user.id }).update({ trial_used: true });
    }
    await trx('admin_audit').insert({
      actor: 'system', action: 'grant_trial', target: phone, ip: 'localhost', reason: 'one_hour_first_time',
      provider_response: JSON.stringify({ expires_at: expiresAt }), created_at: new Date()
    });

    return { ok: true, session: { code, expiresAt } };
  });
}

async function createOrExtendSubscriptionForPayment(phone, planSlug = 'weekly_unlimited', providerInfo = {}) {
  const db = getDb();
  return await db.transaction(async trx => {
    // user
    let user = await trx('users').where({ phone }).first();
    if (!user) {
      const [uid] = await trx('users').insert({ phone, created_at: new Date() }).returning('id');
      user = { id: uid?.id || uid };
    }

    // plan
    const plan = await trx('plans').where({ slug: planSlug }).first();
    if (!plan) throw new Error('plan_not_found');

    // idempotent by provider_payment_id
    if (providerInfo?.provider_payment_id) {
      const existing = await trx('orders').where({ provider_payment_id: providerInfo.provider_payment_id }).first();
      if (existing) return { ok: true, already: true };
    }

    const orderKey = providerInfo.provider_payment_id || ('manual-' + Date.now());
    await trx('orders').insert({
      order_id: orderKey,
      user_phone: phone,
      amount_cents: Math.round((providerInfo.amount || (plan.price_cents ? plan.price_cents / 100 : 7)) * 100),
      currency: providerInfo.currency || 'USD',
      status: 'paid',
      provider: providerInfo.provider || 'manual',
      provider_payment_id: providerInfo.provider_payment_id || null,
      created_at: new Date()
    });

    const now = new Date();
    const curSub = await trx('subscriptions').where({ user_id: user.id, status: 'active' }).andWhere('expires_at', '>', now).first();
    const base = curSub ? new Date(curSub.expires_at) : now;
    const newExpiry = new Date(base);
    if (planSlug === 'weekly_unlimited') newExpiry.setDate(base.getDate() + 7);

    if (curSub) {
      await trx('subscriptions').where({ id: curSub.id }).update({ expires_at: newExpiry, updated_at: new Date() });
    } else {
      await trx('subscriptions').insert({ user_id: user.id, plan_id: plan.id, status: 'active', started_at: now, expires_at: newExpiry, provider: providerInfo.provider || 'ecocash', provider_subscription_id: orderKey, created_at: now });
    }

    const sessionCode = 'S-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    await trx('sessions').insert({ user_id: user.id, code: sessionCode, kind: 'subscription', expires_at: newExpiry, created_at: new Date() });

    await trx('admin_audit').insert({
      actor: providerInfo.verified_by || 'system', action: 'provider_grant', target: phone, ip: 'localhost', reason: providerInfo.reason || 'provider_verified', provider_response: JSON.stringify(providerInfo || {}), created_at: new Date()
    });

    return { ok: true, expiresAt: newExpiry, sessionCode };
  });
}

const instance = new SubscriptionService();

module.exports = Object.assign(instance, {
  startTrial,
  createOrExtendSubscriptionForPayment
});
