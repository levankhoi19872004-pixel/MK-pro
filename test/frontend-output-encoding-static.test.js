'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));
}

test('critical web catalog and order renderers encode database-controlled text', () => {
  const products = read('public/js/app/02-products.js');
  const customers = read('public/js/app/03-customers-autocomplete.js');
  const imports = read('public/js/app/04-import-orders.js');
  const sales = read('public/js/app/05-sales-orders.js');

  assert.match(products, /escapeProductHtml\(p\.name/);
  assert.match(products, /escapeProductHtml\(p\.code/);
  assert.match(customers, /escapeHtml\(c\.name/);
  assert.match(customers, /editCustomerByRow/);
  assert.match(imports, /escapeImportOrderHtml\(i\.productName/);
  assert.match(sales, /escapeSalesHtml\(i\.productName/);
  assert.match(sales, /const customerName=escapeSalesHtml/);
  assert.doesNotMatch(sales, /salesOrderList\.innerHTML=err\.message/);
});

test('users promotions debt and import previews encode database-controlled text', () => {
  const reports = [read('public/js/app/admin/08a-reports.js'),read('public/js/app/admin/08b-users.js'),read('public/js/app/admin/08c-promotions-legacy.js'),read('public/js/app/admin/08d-import-excel.js'),read('public/js/app/admin/08e-promotion-programs.js'),read('public/js/app/admin/08f-vat-export.js')].join('\n');
  const debt = [
    read('public/js/app/debt/07a-debt-core.js'),
    read('public/js/app/debt/07b-return-orders.js'),
    read('public/js/app/debt/07c-ar-cashbook.js'),
    read('public/js/app/debt/07d-master-return-orders.js'),
    read('public/js/app/debt/07e-debt-collections.js'),
    read('public/js/app/debt/07f-fund-ledger.js')
  ].join('\n');

  assert.match(reports, /escapeImportHtml\(u\.username/);
  assert.match(reports, /escapeImportHtml\(p\.conditionText/);
  assert.match(reports, /safeInlineEncodedArg\(u\.id\)/);
  assert.match(reports, /escapeImportHtml\(importRowToText\(row\)\)/);
  assert.doesNotMatch(reports, /userTable\.innerHTML=`[^`]*\$\{err\.message\}/s);
  assert.doesNotMatch(reports, /promotionTable\.innerHTML=`[^`]*\$\{err\.message\}/s);
  assert.doesNotMatch(debt, /receiptHistoryTable\.innerHTML=`[^`]*\$\{err\.message\}/s);
});

test('import preview queue is bounded by concurrency and queue size', () => {
  const queue = read('src/jobs/importPreviewQueue.js');
  assert.match(queue, /IMPORT_PREVIEW_MAX_CONCURRENCY/);
  assert.match(queue, /IMPORT_PREVIEW_MAX_QUEUE/);
  assert.match(queue, /activeJobs < (?:IMPORT_PREVIEW_MAX_CONCURRENCY|maxConcurrency)/);
  assert.match(queue, /IMPORT_PREVIEW_QUEUE_FULL/);
});
