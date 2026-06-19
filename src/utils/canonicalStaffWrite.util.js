'use strict';

const LEGACY_OPERATIONAL_STAFF_FIELDS = Object.freeze([
  'salesmanCode',
  'salesmanName',
  'nvbhCode',
  'nvbhName',
  'salesPersonCode',
  'salesPersonName',
  'deliveryCode',
  'deliveryName',
  'nvghCode',
  'nvghName',
  'shipperCode',
  'shipperName'
]);

function text(value) {
  return String(value || '').trim();
}

function first(source = {}, fields = []) {
  for (const field of fields) {
    const value = text(source[field]);
    if (value) return value;
  }
  return '';
}

function canonicalizeAllocation(row = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  return canonicalizeOperationalStaff(row, { normalizeAllocations: false });
}

function canonicalizeOperationalStaff(source = {}, options = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;

  const target = { ...source };
  const salesStaffCode = first(target, [
    'salesStaffCode',
    'salesmanCode',
    'nvbhCode',
    'salesPersonCode'
  ]);
  const salesStaffName = first(target, [
    'salesStaffName',
    'salesmanName',
    'nvbhName',
    'salesPersonName'
  ]);
  const deliveryStaffCode = first(target, [
    'deliveryStaffCode',
    'deliveryCode',
    'nvghCode',
    'shipperCode'
  ]);
  const deliveryStaffName = first(target, [
    'deliveryStaffName',
    'deliveryName',
    'nvghName',
    'shipperName'
  ]);

  if (salesStaffCode) target.salesStaffCode = salesStaffCode;
  if (salesStaffName) target.salesStaffName = salesStaffName;
  if (deliveryStaffCode) target.deliveryStaffCode = deliveryStaffCode;
  if (deliveryStaffName) target.deliveryStaffName = deliveryStaffName;

  for (const field of LEGACY_OPERATIONAL_STAFF_FIELDS) {
    delete target[field];
  }

  if (options.normalizeAllocations !== false && Array.isArray(target.allocations)) {
    target.allocations = target.allocations.map(canonicalizeAllocation);
  }

  return target;
}

module.exports = {
  LEGACY_OPERATIONAL_STAFF_FIELDS,
  canonicalizeOperationalStaff
};
