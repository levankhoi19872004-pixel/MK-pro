'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('sales UI exposes VAT choice, isolated save and non-invoice export', () => {
  const html = read('public/index.html');
  const js = read('public/js/app/05-sales-orders.js');
  assert.match(html, /name="vatInvoiceRequired" value="true"/);
  assert.match(html, /name="vatInvoiceRequired" value="false"/);
  assert.match(html, /exportVatNonInvoiceOrdersButton/);
  assert.match(js, /patchSalesOrderVatSetting/);
  assert.match(js, /vat-invoice-setting/);
  assert.match(js, /toggleSalesOrderVat/);
});
