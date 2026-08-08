'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const CanonicalDeliveryFinancialScopeReader = require('./CanonicalDeliveryFinancialScopeReader');

let models = null;
function getModels() {
  if (models) return models;
  models = {
    SalesOrder: require('../../models/SalesOrder'),
    MasterOrder: require('../../models/MasterOrder')
  };
  return models;
}

function setModelsForTest(nextModels) {
  models = nextModels || null;
}

function money(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function summaryForOrders(orders = []) {
  return orders.reduce((summary, row) => {
    summary.totalReceivable += money(row.totalReceivable ?? row.totalAmount ?? row.amount);
    summary.cashAmount += money(row.cashAmount);
    summary.bankAmount += money(row.bankAmount ?? row.transferAmount);
    summary.bonusAmount += money(row.rewardAmount ?? row.bonusAmount);
    summary.returnAmount += money(row.returnAmount ?? row.returnedAmount);
    summary.debtAmount += money(row.debtAmount ?? row.finalDebtAmount ?? row.remainingAmount);
    return summary;
  }, {
    totalReceivable: 0,
    cashAmount: 0,
    bankAmount: 0,
    bonusAmount: 0,
    returnAmount: 0,
    debtAmount: 0
  });
}

async function listDeliveryTodayOrdersCompact(query = {}, options = {}) {
  const startedAt = Date.now();
  const deliveryDate = dateUtil.toDateOnly(query.date || query.deliveryDate || dateUtil.todayVN());
  const deliveryStaffCode = String(query.deliveryStaffCode || query.deliveryStaff || query.delivery || '').trim();
  const requestedLimit = Number.parseInt(query.limit, 10);
  const maxOrders = Math.min(
    CanonicalDeliveryFinancialScopeReader.DEFAULT_MAX_ORDERS,
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.max(requestedLimit, CanonicalDeliveryFinancialScopeReader.DEFAULT_PAGE_SIZE)
      : CanonicalDeliveryFinancialScopeReader.DEFAULT_MAX_ORDERS
  );

  const result = await CanonicalDeliveryFinancialScopeReader.listAllOrders({
    ...query,
    date: deliveryDate,
    deliveryDate,
    delivery: deliveryStaffCode,
    deliveryStaffCode
  }, getModels(), {
    ...options,
    maxOrders
  });
  const orders = Array.isArray(result.orders) ? result.orders : [];
  const elapsedMs = Math.max(0, Date.now() - startedAt);

  return {
    ok: true,
    orders,
    rows: orders,
    summary: summaryForOrders(orders),
    total: orders.length,
    ms: elapsedMs,
    perf: {
      totalMs: elapsedMs,
      compactMs: elapsedMs,
      canonicalOrderCount: orders.length,
      source: 'orders',
      masterOrdersRole: 'metadata-only'
    },
    diagnostics: {
      ...(result.diagnostics || {}),
      adapter: 'CanonicalDeliveryFinancialScopeAdapter',
      consumer: 'fund-delivery-remittance'
    }
  };
}

module.exports = {
  listDeliveryTodayOrdersCompact,
  listDeliveryToday: listDeliveryTodayOrdersCompact,
  summaryForOrders,
  setModelsForTest
};
