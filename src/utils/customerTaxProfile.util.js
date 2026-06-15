'use strict';

const TAX_CODE_KEYS = [
  'taxCode', 'customerTaxCode', 'taxNumber', 'vatNumber', 'vatCode', 'mst', 'maSoThue',
  'Mã số thuế', 'Ma so thue'
];

const TAX_INVOICE_ADDRESS_KEYS = [
  'taxInvoiceAddress', 'customerTaxInvoiceAddress', 'invoiceAddress', 'vatInvoiceAddress',
  'billingAddress', 'diaChiHoaDon', 'Địa chỉ hóa đơn thuế', 'Địa chỉ hoá đơn thuế',
  'Địa chỉ hóa đơn', 'Địa chỉ hoá đơn', 'Dia chi hoa don thue', 'Dia chi hoa don'
];

function cleanText(value) {
  return String(value ?? '').trim();
}

function hasOwn(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function firstText(source = {}, keys = []) {
  for (const key of keys) {
    const value = cleanText(source?.[key]);
    if (value) return value;
  }
  return '';
}

function hasAnyOwn(source = {}, keys = []) {
  return keys.some((key) => hasOwn(source, key));
}

function extractCustomerTaxProfile(source = {}, options = {}) {
  const taxCode = firstText(source, TAX_CODE_KEYS);
  let taxInvoiceAddress = firstText(source, TAX_INVOICE_ADDRESS_KEYS);
  if (!taxInvoiceAddress && options.fallbackAddress) {
    taxInvoiceAddress = firstText(source, ['address', 'customerAddress', 'deliveryAddress', 'fullAddress']);
  }
  return {
    taxCode,
    taxInvoiceAddress,
    hasTaxCode: hasAnyOwn(source, TAX_CODE_KEYS),
    hasTaxInvoiceAddress: hasAnyOwn(source, TAX_INVOICE_ADDRESS_KEYS)
  };
}

module.exports = {
  TAX_CODE_KEYS,
  TAX_INVOICE_ADDRESS_KEYS,
  extractCustomerTaxProfile,
  firstText
};
