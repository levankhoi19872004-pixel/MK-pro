'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { extractCustomerTaxProfile } = require('../src/utils/customerTaxProfile.util');

test('customer tax profile reads canonical fields', () => {
  const result = extractCustomerTaxProfile({
    taxCode: ' 1001234567-001 ',
    taxInvoiceAddress: ' Số 1 Minh Khai '
  });
  assert.equal(result.taxCode, '1001234567-001');
  assert.equal(result.taxInvoiceAddress, 'Số 1 Minh Khai');
  assert.equal(result.hasTaxCode, true);
  assert.equal(result.hasTaxInvoiceAddress, true);
});

test('customer tax profile remains compatible with legacy aliases', () => {
  const result = extractCustomerTaxProfile({ mst: '1007654321', invoiceAddress: 'Địa chỉ cũ' });
  assert.equal(result.taxCode, '1007654321');
  assert.equal(result.taxInvoiceAddress, 'Địa chỉ cũ');
});

test('tax invoice address does not silently fallback unless requested', () => {
  const strict = extractCustomerTaxProfile({ address: 'Địa chỉ giao hàng' });
  const fallback = extractCustomerTaxProfile({ address: 'Địa chỉ giao hàng' }, { fallbackAddress: true });
  assert.equal(strict.taxInvoiceAddress, '');
  assert.equal(fallback.taxInvoiceAddress, 'Địa chỉ giao hàng');
});
