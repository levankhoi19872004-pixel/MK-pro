'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function body(source, name) {
  const start = source.indexOf(`async function ${name}(`) !== -1
    ? source.indexOf(`async function ${name}(`)
    : source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const next = source.indexOf('\nfunction ', start + 20);
  const nextAsync = source.indexOf('\nasync function ', start + 20);
  const candidates = [next, nextAsync].filter((n) => n !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test('Phase216 frontend large list screens have abort controller or request sequence guard', () => {
  const deliveryToday = read('public/js/app/new/91-delivery-today-new.js');
  assert.match(body(deliveryToday, 'load'), /AbortController/);
  assert.match(body(deliveryToday, 'load'), /signal:\s*loadController\.signal/);

  const sales = read('public/js/app/05-sales-orders.source/part-04.jsfrag');
  assert.match(sales, /salesOrderAbortController\.abort\(\)/);
  assert.match(sales, /signal:\s*salesOrderAbortController\.signal/);

  const dms = read('public/js/app/10-dms-inventory.js');
  assert.match(dms, /loadAbortController/);
  assert.match(dms, /historyAbortController/);
  assert.match(dms, /AbortController/);

  const returns = read('public/js/app/debt/07b-return-orders.js');
  assert.match(returns, /returnOrderAbortController/);
  assert.match(body(returns, 'loadReturnOrders'), /AbortController/);
  assert.match(body(returns, 'loadReturnOrders'), /signal:\s*controller\.signal/);

  const products = read('public/js/app/02-products.js');
  assert.match(products, /productListRequestSeq/);
  assert.match(products, /if\(requestSeq !== productListRequestSeq\) return null/);

  const customers = read('public/js/app/03-customers-autocomplete.js');
  assert.match(customers, /customerListRequestSeq/);
  assert.match(customers, /if\(requestSeq !== customerListRequestSeq\) return null/);
});

test('tab bootstrap lazy-loads active tabs instead of preloading all modules', () => {
  const boot = read('public/js/bootstrap/03-tab-loader.js');
  assert.match(boot, /V45_BOOT_LOADED_TABS/);
  assert.match(boot, /loadTabDataOnce/);
  assert.match(boot, /if\(!force && V45_BOOT_LOADED_TABS\.has\(tabName\)\) return/);
  assert.match(boot, /initialTabName/);
  assert.doesNotMatch(boot, /Promise\.all\(\[\s*loadHomeDashboard\(\),\s*loadProducts\(\),\s*loadCustomers\(\)/);
});

test('report center aborts stale report requests and does not preload full report data into dashboard', () => {
  const reports = read('public/js/app/admin/08a-reports.js');
  assert.match(reports, /activeRequestController/);
  assert.match(reports, /AbortController/);
  assert.match(reports, /reportRequestWasAborted/);
  assert.match(reports, /openModal:\s*false/);
  const boot = read('public/js/bootstrap/03-tab-loader.js');
  assert.match(boot, /loadReports\(\{ openModal: false \}\)/);
});


test('import session polling is abortable and bounded to one active poll controller', () => {
  const importSource = read('public/js/app/admin/08d-import-excel.source/part-03.jsfrag');
  assert.match(importSource, /stopImportCommitPolling\(\)/);
  assert.match(importSource, /new AbortController\(\)/);
  assert.match(importSource, /importCommitPollController/);
  assert.match(importSource, /signal:\s*pollController\.signal/);
});
