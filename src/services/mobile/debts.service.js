'use strict';

const DebtReadService = require('../DebtReadService');
const DebtCollectionService = require('../DebtCollectionService');

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
  const collectorType = text(query.collectorType || mobileUser.role || '').toLowerCase() === 'delivery' ? 'delivery' : 'sales';
  const scopedQuery = {
    ...query,
    collectorType,
    includePendingCollections: query.includePendingCollections ?? '1',
    limit: query.limit || 100,
    includePaid: query.includePaid || '0'
  };

  if (query.customerKeyword && !scopedQuery.q) scopedQuery.q = query.customerKeyword;

  if (collectorType === 'delivery') {
    const value = deliveryStaffCode(mobileUser) || deliveryStaffName(mobileUser);
    if (value) scopedQuery.delivery = value;
  } else {
    const value = salesStaffCode(mobileUser) || salesStaffName(mobileUser);
    if (value) scopedQuery.salesman = value;
  }

  return scopedQuery;
}

function createMobileDebtService() {
  async function listDebts({ query = {}, mobileUser } = {}) {
    const result = await DebtReadService.getCustomerDebts(scopeDebtQuery(query, mobileUser));
    return {
      body: result
    };
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
