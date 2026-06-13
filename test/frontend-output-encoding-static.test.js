'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
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
  assert.match(imports, /escapeImportHtml\(i\.productName/);
  assert.match(sales, /escapeSalesHtml\(i\.productName/);
  assert.match(sales, /const customerName=escapeSalesHtml/);
  assert.doesNotMatch(sales, /salesOrderList\.innerHTML=err\.message/);
});

test('users promotions debt and import previews encode database-controlled text', () => {
  const reports = read('public/js/app/08-reports-users-promotions-import-excel.js');
  const debt = read('public/js/app/07-debt-cashbook.js');

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
  assert.match(queue, /activeJobs < IMPORT_PREVIEW_MAX_CONCURRENCY/);
  assert.match(queue, /IMPORT_PREVIEW_QUEUE_FULL/);
});
