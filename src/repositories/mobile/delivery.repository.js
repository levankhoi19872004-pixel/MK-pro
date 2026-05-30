'use strict';
const returnOrderRepository = require('../returnOrderRepository');

/**
 * Repository tầng dữ liệu cho mobile delivery.
 * Dùng Mongo primary data snapshot từ legacy context, không đọc/ghi JSON trực tiếp.
 */
function createMobileDeliveryRepository(ctx) {
  if (!ctx || typeof ctx.getPrimaryDataSnapshot !== 'function' || typeof ctx.persistPrimaryDataSnapshot !== 'function') {
    throw new Error('MobileDeliveryRepository cần Mongo primary data snapshot trong context');
  }

  async function persistDeliverySnapshotSafely(data = {}) {
      if (!data) return;
      data.returnOrders = await returnOrderRepository.findAll();
      const seen = new Map();
      data.returnOrders = (data.returnOrders || []).filter((row) => {
        const key = String(row.id || row.code || '');
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.set(key,true);
        return true;
      });
      return ctx.persistPrimaryDataSnapshot(data);
    }

  return {
    getPrimaryDataSnapshot: ctx.getPrimaryDataSnapshot,
    persistPrimaryDataSnapshot: ctx.persistPrimaryDataSnapshot,
    persistDeliverySnapshotSafely,
    findSalesOrder(data, orderIdOrCode) {
      const key = String(orderIdOrCode || '').trim();
      return (data.salesOrders || []).find((item) => item.id === key || item.code === key);
    },
    findCustomer(data, customerIdOrCode) {
      return ctx.findCustomer(data, customerIdOrCode);
    },
    addCashbookEntry(data, entry) {
      data.cashbooks = data.cashbooks || [];
      data.cashbooks.push(entry);
      return entry;
    }
  };
}

module.exports = { createMobileDeliveryRepository };
