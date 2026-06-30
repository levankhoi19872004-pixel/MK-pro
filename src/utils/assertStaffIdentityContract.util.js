'use strict';

function clean(value = '') {
  return String(value ?? '').trim();
}

function normalizeStaffIdentity(row = {}) {
  return {
    salesStaffCode: clean(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
    salesStaffName: clean(row.salesStaffName || row.salesmanName || row.nvbhName),
    deliveryStaffCode: clean(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: clean(row.deliveryStaffName || row.deliveryName || row.nvghName),
    auditStaffCode: clean(row.staffCode),
    auditStaffName: clean(row.staffName)
  };
}

function validateStaffIdentityContract(row = {}, options = {}) {
  const identity = normalizeStaffIdentity(row);
  const errors = [];
  if (options.requireSalesStaff && !identity.salesStaffCode) errors.push({ code: 'STAFF_IDENTITY_MISSING_SALES_CODE', field: 'salesStaffCode' });
  if (options.requireDeliveryStaff && !identity.deliveryStaffCode) errors.push({ code: 'STAFF_IDENTITY_MISSING_DELIVERY_CODE', field: 'deliveryStaffCode' });
  if (identity.salesStaffCode && identity.deliveryStaffCode && identity.salesStaffCode.toLowerCase() === identity.deliveryStaffCode.toLowerCase()) {
    errors.push({ code: 'STAFF_IDENTITY_SALES_DELIVERY_COLLISION', fields: ['salesStaffCode', 'deliveryStaffCode'] });
  }
  if (options.disallowGenericStaffAsBusinessStaff && identity.auditStaffCode) {
    if (!identity.salesStaffCode && clean(row.salesStaffRole || row.role).toLowerCase().includes('sales')) errors.push({ code: 'STAFF_IDENTITY_GENERIC_STAFF_USED_AS_SALES', field: 'staffCode' });
    if (!identity.deliveryStaffCode && clean(row.deliveryStaffRole || row.role).toLowerCase().includes('delivery')) errors.push({ code: 'STAFF_IDENTITY_GENERIC_STAFF_USED_AS_DELIVERY', field: 'staffCode' });
  }
  return { ok: errors.length === 0, errors, identity };
}

function assertStaffIdentityContract(row = {}, options = {}) {
  const result = validateStaffIdentityContract(row, options);
  if (!result.ok) {
    const err = new Error(`Invalid staff identity: ${result.errors.map((item) => item.code).join(', ')}`);
    err.code = 'INVALID_STAFF_IDENTITY_CONTRACT';
    err.severity = 'P1';
    err.validation = result;
    throw err;
  }
  return result.identity;
}

module.exports = { normalizeStaffIdentity, validateStaffIdentityContract, assertStaffIdentityContract };
