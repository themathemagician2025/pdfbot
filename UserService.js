const BaseService = require('./BaseService');
const User = require('../models/User');
const SubscriptionService = require('./SubscriptionService');
const AdminAuditService = require('./AdminAuditService');
const { v4: uuidv4 } = require('uuid');

class UserService extends BaseService {
  constructor() {
    super(User);
    this.subscriptionService = new SubscriptionService();
    this.adminAuditService = new AdminAuditService();
  }

  async findOrCreateUser(phone, email = null) {
    // Normalize phone number (remove any non-digit characters)
    const normalizedPhone = phone.replace(/\D/g, '');
    
    // Try to find existing user
    let user = await this.model.query()
      .where('phone', normalizedPhone)
      .first();

    // Create new user if not found
    if (!user) {
      user = await this.model.query().insert({
        phone: normalizedPhone,
        email,
        trial_used: false,
        is_blocked: false,
      });

      // Log user creation
      await this.adminAuditService.logAction(
        'system',
        'user_create',
        'user',
        user.id,
        '0.0.0.0',
        'system',
        { phone: normalizedPhone }
      );
    }

    return user;
  }

  async startTrial(userId) {
    const trx = await this.transaction();
    try {
      const user = await this.model.query(trx).findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (user.trial_used) {
        throw new Error('Trial already used');
      }

      // Mark trial as used
      await this.model.query(trx)
        .findById(userId)
        .patch({ trial_used: true });

      // Create trial subscription
      const subscription = await this.subscriptionService.createOrExtendSubscription(
        userId,
        'trial',
        trx
      );

      // Log trial activation
      await this.adminAuditService.logAction(
        'system',
        'trial_activated',
        'user',
        userId,
        '0.0.0.0',
        'system',
        { subscriptionId: subscription.id }
      );

      await trx.commit();
      return subscription;
    } catch (error) {
      await trx.rollback();
      console.error('Error starting trial:', error);
      throw error;
    }
  }

  async checkAccess(userId) {
    const user = await this.model.query()
      .findById(userId)
      .withGraphFetched('subscriptions');

    if (!user) {
      return { hasAccess: false, reason: 'user_not_found' };
    }

    if (user.is_blocked) {
      return { hasAccess: false, reason: 'user_blocked' };
    }

    // Check for active subscription
    const now = new Date();
    const activeSubscription = user.subscriptions?.find(
      sub => sub.status === 'active' && new Date(sub.expires_at) > now
    );

    if (activeSubscription) {
      return { 
        hasAccess: true, 
        subscription: activeSubscription,
        isTrial: activeSubscription.plan_type === 'trial'
      };
    }

    // Check if trial is available
    if (!user.trial_used) {
      return { hasAccess: false, reason: 'trial_available' };
    }

    return { hasAccess: false, reason: 'subscription_required' };
  }

  async blockUser(userId, adminId, reason = '') {
    const trx = await this.transaction();
    try {
      const user = await this.model.query(trx)
        .patchAndFetchById(userId, { is_blocked: true });

      // Log the action
      await this.adminAuditService.logAction(
        adminId,
        'user_block',
        'user',
        userId,
        '0.0.0.0', // IP should come from request
        'system',  // User agent should come from request
        { reason }
      );

      await trx.commit();
      return user;
    } catch (error) {
      await trx.rollback();
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  async unblockUser(userId, adminId, reason = '') {
    const trx = await this.transaction();
    try {
      const user = await this.model.query(trx)
        .patchAndFetchById(userId, { is_blocked: false });

      // Log the action
      await this.adminAuditService.logAction(
        adminId,
        'user_unblock',
        'user',
        userId,
        '0.0.0.0', // IP should come from request
        'system',  // User agent should come from request
        { reason }
      );

      await trx.commit();
      return user;
    } catch (error) {
      await trx.rollback();
      console.error('Error unblocking user:', error);
      throw error;
    }
  }

  async getUserStats() {
    const [totalUsers, trialUsers, activeSubs, expiredSubs] = await Promise.all([
      this.model.query().resultSize(),
      this.model.query().where('trial_used', false).resultSize(),
      this.model.query()
        .joinRelated('subscriptions')
        .where('subscriptions.status', 'active')
        .where('subscriptions.expires_at', '>', new Date())
        .resultSize(),
      this.model.query()
        .joinRelated('subscriptions')
        .where('subscriptions.status', 'expired')
        .orWhere('subscriptions.expires_at', '<=', new Date())
        .resultSize()
    ]);

    return {
      totalUsers,
      trialUsers,
      activeSubs,
      expiredSubs,
      paidUsers: totalUsers - trialUsers
    };
  }
}

module.exports = new UserService();
