'use strict';

// STAFF_IDENTITY_CONTRACT_START

const SALES_STAFF_CODE_FIELDS = Object.freeze([
  'salesStaffCode',
  'salesmanCode',
  'employeeCode',
  'maNhanVien'
]);

const SALES_STAFF_NAME_FIELDS = Object.freeze([
  'salesStaffName',
  'salesmanName',
  'employeeName',
  'fullName',
  'name'
]);

const DELIVERY_STAFF_CODE_FIELDS = Object.freeze([
  'deliveryStaffCode',
  'shipperCode',
  'employeeCode',
  'maNhanVien'
]);

const DELIVERY_STAFF_NAME_FIELDS = Object.freeze([
  'deliveryStaffName',
  'shipperName',
  'employeeName',
  'fullName',
  'name'
]);

const FORBIDDEN_STAFF_IDENTITY_FIELDS = Object.freeze([
  'staffCode',
  'staffName',
  'username',
  '_id',
  'id'
]);

function cleanStaffText(value = '') {
  return String(value || '').trim();
}

function pickFirst(source = {}, fields = []) {
  for (const field of fields) {
    const value = cleanStaffText(source[field]);
    if (value) return value;
  }
  return '';
}

function pickSalesStaffCode(source = {}) {
  return pickFirst(source, SALES_STAFF_CODE_FIELDS);
}

function pickSalesStaffName(source = {}) {
  return pickFirst(source, SALES_STAFF_NAME_FIELDS);
}

function pickDeliveryStaffCode(source = {}) {
  return pickFirst(source, DELIVERY_STAFF_CODE_FIELDS);
}

function pickDeliveryStaffName(source = {}) {
  return pickFirst(source, DELIVERY_STAFF_NAME_FIELDS);
}

function buildSalesStaffSnapshot(source = {}) {
  const code = pickSalesStaffCode(source);
  const name = pickSalesStaffName(source);

  return {
    salesStaffCode: code,
    salesStaffName: name,
    salesmanCode: code,
    salesmanName: name
  };
}

function buildDeliveryStaffSnapshot(source = {}) {
  const code = pickDeliveryStaffCode(source);
  const name = pickDeliveryStaffName(source);

  return {
    deliveryStaffCode: code,
    deliveryStaffName: name,
    shipperCode: code,
    shipperName: name
  };
}

module.exports = {
  SALES_STAFF_CODE_FIELDS,
  SALES_STAFF_NAME_FIELDS,
  DELIVERY_STAFF_CODE_FIELDS,
  DELIVERY_STAFF_NAME_FIELDS,
  FORBIDDEN_STAFF_IDENTITY_FIELDS,
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName,
  buildSalesStaffSnapshot,
  buildDeliveryStaffSnapshot
};

// STAFF_IDENTITY_CONTRACT_END
