'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('SSE frontend always sends selected NVGH code when exporting delivery-staff summary', () => {
  const source = read('public/js/app/admin/08f-vat-export.js');
  assert.match(source, /function selectedDeliveryStaffCode\(\)/);
  assert.match(source, /deliveryStaffCode:selectedDeliveryStaffCode\(\)/);
  assert.match(source, /params\.set\('summaryBy','deliveryStaff'\)/);
  assert.match(source, /params\.set\('deliveryStaffCode',filters\.deliveryStaffCode\)/);
  assert.match(source, /params\.get\('deliveryStaffCode'\)/);
});

test('SSE backend preserves and enforces deliveryStaffCode scope after master-order lookup', () => {
  const queryService = read('src/services/invoiceExportQuery.service.js');
  assert.match(queryService, /query\.deliveryStaffCode \|\| query\.deliveryCode \|\| query\.nvghCode \|\| query\.deliveryStaff \|\| query\.delivery \|\| query\.nvgh/);
  assert.match(queryService, /function matchesDeliveryStaffCode\(row = \{\}, deliveryStaffCode = ''\)/);
  assert.match(queryService, /rawMasterOrders\.filter\(\(master\) => matchesDeliveryStaffCode\(master, filters\.deliveryStaffCode\)\)/);
  assert.match(queryService, /scopedOrders\.filter\(\(order\) => matchesDeliveryStaffCode\(order, filters\.deliveryStaffCode\)\)/);
});

test('SSE filename and error report keep NVGH filter to make wrong-scope export obvious', () => {
  const source = read('src/services/sseInvoiceExport.service.js');
  assert.match(source, /const deliveryStaffCode = cleanText\(query\.deliveryStaffCode \|\| query\.deliveryCode \|\| query\.nvghCode/);
  assert.match(source, /_NVGH_\$\{deliveryStaffCode\.replace/);
  assert.match(source, /'deliveryStaffCode','deliveryCode','nvghCode','deliveryStaff','delivery','nvgh'/);
  assert.match(source, /params\.set\('summaryBy', 'deliveryStaff'\)/);
});
