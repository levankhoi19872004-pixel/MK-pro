'use strict';

/**
 * Mobile Auth Repository
 * Chỉ phụ trách truy xuất dữ liệu đăng nhập mobile từ Mongo models/store.
 */
function createMobileAuthRepository(ctx) {
  const { MongoStore } = require('../../services/mongoSyncService');
  if (!ctx || typeof ctx.getPrimaryDataSnapshot !== 'function' || typeof ctx.persistPrimaryDataSnapshot !== 'function') {
    throw new Error('MobileAuthRepository cần context snapshot để ghi mobile log');
  }

  return {
    getPrimaryDataSnapshot: ctx.getPrimaryDataSnapshot,
    persistPrimaryDataSnapshot: ctx.persistPrimaryDataSnapshot,
    async findActiveStaffByLogin(loginKey) {
      const username = String(loginKey || '').trim();
      if (!username) return null;
      return MongoStore.staffs.findOne({
        isActive: { $ne: false },
        $or: [{ username }, { code: username }, { phone: username }, { name: username }]
      }).lean();
    },
    async listActiveRoles() {
      return MongoStore.roles.find({ isActive: { $ne: false } }).sort({ code: 1 }).lean();
    }
  };
}

module.exports = { createMobileAuthRepository };
