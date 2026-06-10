'use strict';

/**
 * Mobile Sales Repository
 * Tầng dữ liệu cho app bán hàng mobile.
 * Hiện dùng Mongo primary snapshot qua context để giữ tương thích posting engine cũ.
 */
function createMobileSalesRepository(ctx) {
  if (!ctx || typeof ctx.getPrimaryDataSnapshot !== 'function' || typeof ctx.saveOperationalData !== 'function') {
    throw new Error('MobileSalesRepository cần Mongo primary snapshot/saveOperationalData trong context');
  }

  return {
    getPrimaryDataSnapshot: ctx.getPrimaryDataSnapshot,
    saveOperationalData: ctx.saveOperationalData,
    refreshOrderDocumentCacheFromMongo: ctx.refreshOrderDocumentCacheFromMongo,
    findCustomer(data, customerIdOrCode) {
      return ctx.findCustomer(data, customerIdOrCode);
    },
    findProduct(data, productIdOrCode) {
      return ctx.findProduct(data, productIdOrCode);
    },
    findSalesOrder(data, orderIdOrCode) {
      const key = String(orderIdOrCode || '').trim();
      return (data.salesOrders || []).find((item) => String(item.id || '') === key || String(item.code || '') === key);
    },
    addSalesOrder(data, order) {
      data.salesOrders = data.salesOrders || [];
      data.salesOrders.push(order);
      return order;
    },
    addPayment(data, payment) {
      data.payments = data.payments || [];
      data.payments.push(payment);
      return payment;
    },
    addCashbookEntry(data, entry) {
      data.cashbooks = data.cashbooks || [];
      data.cashbooks.push(entry);
      return entry;
    }
  };
}

module.exports = { createMobileSalesRepository };
