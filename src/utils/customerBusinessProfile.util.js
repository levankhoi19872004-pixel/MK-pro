'use strict';

const BUSINESS_NAME_KEYS = Object.freeze([
  'businessName',
  'customerBusinessName',
  'householdBusinessName',
  'taxBusinessName',
  'invoiceBusinessName',
  'tenHoKinhDoanh',
  'Tên hộ kinh doanh',
  'Ten ho kinh doanh'
]);

function cleanText(value) {
  return String(value ?? '').trim();
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function extractCustomerBusinessProfile(source = {}) {
  let businessName = '';
  let hasBusinessName = false;
  for (const key of BUSINESS_NAME_KEYS) {
    if (!hasOwn(source, key)) continue;
    hasBusinessName = true;
    const value = cleanText(source[key]);
    if (value) {
      businessName = value;
      break;
    }
  }
  return { businessName, hasBusinessName };
}

module.exports = {
  BUSINESS_NAME_KEYS,
  extractCustomerBusinessProfile
};
