'use strict';

const {
  pickSalesStaffName,
  pickUserAccountSalesStaffCode
} = require('./staffIdentity');

const CUSTOMER_SALES_CODE_FIELDS = Object.freeze([
  'salesStaffCode',
  'salesmanCode',
  'assignedSalesStaffCode',
  'nvbhCode',
  'maNVBH',
  // Legacy customer assignment only. New orders must never derive sales identity from this field.
  'staffCode'
]);

const CUSTOMER_SALES_NAME_FIELDS = Object.freeze([
  'salesStaffName',
  'salesmanName',
  'assignedSalesStaffName',
  'nvbhName',
  'tenNVBH',
  // Legacy customer assignment only.
  'staffName'
]);

function clean(value) {
  return String(value || '').trim();
}

function impossibleFilter() {
  return { _id: { $exists: false } };
}

function customerOwnershipFilter({ salesStaffCode = '', salesStaffName = '', requireIdentity = true } = {}) {
  const code = clean(salesStaffCode);
  const name = clean(salesStaffName);
  const clauses = [];

  if (code) {
    for (const field of CUSTOMER_SALES_CODE_FIELDS) clauses.push({ [field]: code });
  }
  if (name) {
    for (const field of CUSTOMER_SALES_NAME_FIELDS) clauses.push({ [field]: name });
  }

  if (!clauses.length) return requireIdentity ? impossibleFilter() : {};
  return { $or: clauses };
}

function customerOwnershipFilterForSalesUser(user = {}) {
  return customerOwnershipFilter({
    salesStaffCode: pickUserAccountSalesStaffCode(user),
    salesStaffName: pickSalesStaffName(user),
    requireIdentity: true
  });
}

function combineFilters(...filters) {
  const valid = filters.filter((filter) => filter && typeof filter === 'object' && Object.keys(filter).length);
  if (!valid.length) return {};
  if (valid.length === 1) return valid[0];
  return { $and: valid };
}

module.exports = {
  CUSTOMER_SALES_CODE_FIELDS,
  CUSTOMER_SALES_NAME_FIELDS,
  customerOwnershipFilter,
  customerOwnershipFilterForSalesUser,
  combineFilters
};
