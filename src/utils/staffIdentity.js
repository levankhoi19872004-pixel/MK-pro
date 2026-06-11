'use strict';

function pick(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function normalizeSalesStaff(source = {}) {
  return {
    salesStaffCode: pick(source.salesStaffCode, source.salesmanCode, source.nvbhCode, source.code),
    salesStaffName: pick(source.salesStaffName, source.salesmanName, source.nvbhName, source.fullName, source.name)
  };
}

function normalizeDeliveryStaff(source = {}) {
  return {
    deliveryStaffCode: pick(source.deliveryStaffCode, source.deliveryCode, source.nvghCode, source.code),
    deliveryStaffName: pick(source.deliveryStaffName, source.deliveryName, source.nvghName, source.fullName, source.name)
  };
}

module.exports = {
  normalizeSalesStaff,
  normalizeDeliveryStaff
};
