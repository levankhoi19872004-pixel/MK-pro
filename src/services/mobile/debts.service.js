'use strict';

const DebtCollectionService = require('../DebtCollectionService');
const DebtReadService = require('../DebtReadService');

function text(value) {
  return String(value || '').trim();
}

function salesStaffCode(user = {}) {
  return text(user.salesStaffCode || user.salesmanCode || user.nvbhCode || user.maNVBH || user.staffCode || user.code);
}

function salesStaffName(user = {}) {
  return text(user.salesStaffName || user.salesmanName || user.nvbhName || user.maNVBHName || user.fullName || user.name);
}

function deliveryStaffCode(user = {}) {
  return text(user.deliveryStaffCode || user.shipperCode || user.nvghCode || user.staffCode || user.code);
}

function deliveryStaffName(user = {}) {
  return text(user.deliveryStaffName || user.shipperName || user.nvghName || user.fullName || user.name);
}

function scopeDebtQuery(query = {}, mobileUser = {}) {
  const role = text(mobileUser.role || '').toLowerCase();
  const requestedCollectorType = text(query.collectorType || '').toLowerCase();
  const collectorType = role === 'delivery'
    ? 'delivery'
    : role === 'sales'
      ? 'sales'
      : requestedCollectorType === 'delivery'
        ? 'delivery'
        : requestedCollectorType === 'sales'
          ? 'sales'
          : '';
  const scopedQuery = {
    ...query,
    includePendingCollections: query.includePendingCollections ?? '1',
    page: query.page || 1,
    limit: query.limit || 30,
    includePaid: query.includePaid || '0'
  };
  if (collectorType) scopedQuery.collectorType = collectorType;

  if (query.customerKeyword && !scopedQuery.q) scopedQuery.q = query.customerKeyword;

  if (role === 'delivery') {
    const code = deliveryStaffCode(mobileUser);
    if (code) scopedQuery.deliveryStaffCode = code;
    else if (deliveryStaffName(mobileUser)) scopedQuery.deliveryStaffName = deliveryStaffName(mobileUser);
    delete scopedQuery.salesStaffCode;
    delete scopedQuery.salesmanCode;
    delete scopedQuery.salesStaffName;
    delete scopedQuery.salesmanName;
  } else if (role === 'sales') {
    const code = salesStaffCode(mobileUser);
    if (code) scopedQuery.salesStaffCode = code;
    else if (salesStaffName(mobileUser)) scopedQuery.salesStaffName = salesStaffName(mobileUser);
    delete scopedQuery.deliveryStaffCode;
    delete scopedQuery.deliveryCode;
    delete scopedQuery.deliveryStaffName;
  }

  return scopedQuery;
}

function createMobileDebtService() {
  async function listDebts({ query = {}, mobileUser } = {}) {
    const result = await DebtReadService.getMobileCustomerDebts(scopeDebtQuery(query, mobileUser));
    return { body: result };
  }

  async function submitDebtCollection({ body = {}, mobileUser } = {}) {
    const result = await DebtCollectionService.submitDebtCollection({ body, mobileUser });
    if (result.error) return { statusCode: result.status || 400, body: { ok: false, message: result.error } };
    return result;
  }

  return {
    listDebts,
    submitDebtCollection
  };
}

module.exports = {
  createMobileDebtService,
  _internal: { scopeDebtQuery }
};
