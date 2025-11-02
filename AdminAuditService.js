const BaseService = require('./BaseService');
const AdminAudit = require('../models/AdminAudit');

class AdminAuditService extends BaseService {
  constructor() {
    super(AdminAudit);
  }

  async logAction(adminId, action, targetType, targetId, ipAddress, userAgent, metadata = {}) {
    try {
      return await this.model.query().insert({
        admin_id: adminId,
        action,
        target_type: targetType,
        target_id: targetId,
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata,
      });
    } catch (error) {
      console.error('Error logging admin action:', error);
      // Don't throw to avoid breaking the main operation
      return null;
    }
  }

  async getAuditLogs(filters = {}, pagination = { page: 1, pageSize: 50 }) {
    const { page = 1, pageSize = 50 } = pagination;
    const offset = (page - 1) * pageSize;

    const query = this.model.query()
      .withGraphFetched('admin')
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .offset(offset);

    // Apply filters
    if (filters.adminId) {
      query.where('admin_id', filters.adminId);
    }
    if (filters.action) {
      query.where('action', filters.action);
    }
    if (filters.targetType) {
      query.where('target_type', filters.targetType);
    }
    if (filters.targetId) {
      query.where('target_id', filters.targetId);
    }
    if (filters.startDate) {
      query.where('created_at', '>=', new Date(filters.startDate).toISOString());
    }
    if (filters.endDate) {
      query.where('created_at', '<=', new Date(filters.endDate).toISOString());
    }

    return query;
  }

  async getAuditLogsForTarget(targetType, targetId, limit = 20) {
    return this.model.query()
      .where('target_type', targetType)
      .where('target_id', targetId)
      .withGraphFetched('admin')
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  async getAdminActivity(adminId, limit = 50) {
    return this.model.query()
      .where('admin_id', adminId)
      .withGraphFetched('admin')
      .orderBy('created_at', 'desc')
      .limit(limit);
  }
}

module.exports = AdminAuditService;
