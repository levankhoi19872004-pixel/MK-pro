'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}
function functionBody(source, name) {
  let start = source.indexOf(`async function ${name}(`);
  if (start === -1) start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const nextFunction = source.indexOf('\n  function ', start + 20);
  const nextAsyncFunction = source.indexOf('\n  async function ', start + 20);
  const candidates = [nextFunction, nextAsyncFunction].filter((value) => value !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}


test('Phase214 action contract matrix defines P0/P1 command request budgets', () => {
  const doc = read('docs/ACTION_CONTRACT_MATRIX.md');
  [
    'Chốt sổ giao hàng',
    'Ghi nhận điều chỉnh đã chọn',
    'Lưu điều chỉnh đơn giao',
    'Gửi phiếu thu chờ KT',
    'Kế toán xác nhận phiếu thu',
    'Nhập kho đơn trả',
    'Thủ kho xác nhận hàng trả',
    'Import các dòng đã chọn',
    'Xuất Excel SSE'
  ].forEach((label) => assert.match(doc, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(doc, /Request budget/);
  assert.match(doc, /Không reload toàn màn tự động/);
  assert.match(doc, /Read model[^\n]+enqueue/i);
});

test('Delivery Today command actions keep scoped requests and closeout reloads canonical state after patch', () => {
  const source = read('public/js/app/new/91-delivery-today-new.js');
  const closeout = functionBody(source, 'submitCloseout');
  const bulk = functionBody(source, 'submitBulkAdjustmentCommit');
  const adjustment = functionBody(source, 'submitAdjustmentPopup');

  assert.match(closeout, /runCommandOnce\('delivery\.closeout'/);
  assert.match(closeout, /fetch\('\/api\/new\/delivery-today\/closeout'/);
  assert.match(closeout, /patchCloseoutRowsFromResult\(json, rows\)/);
  assert.match(closeout, /await\s+load\(\{\s*silent:\s*true\s*\}\)/);

  assert.match(bulk, /runCommandOnce\('delivery\.bulkAdjustment'/);
  assert.match(bulk, /fetch\('\/api\/new\/delivery-today\/adjustments\/bulk-commit'/);
  assert.match(bulk, /patchBulkAdjustmentRows\(rows, json\)/);
  assert.doesNotMatch(bulk, /await\s+load\(\{\s*silent:\s*true\s*\}\)/);

  assert.match(adjustment, /runCommandOnce\('delivery\.adjustment\.'/);
  assert.match(adjustment, /fetch\(correctionEndpoint\(row\)/);
  assert.match(adjustment, /patchAdjustmentRow\(row, json\)/);
  assert.doesNotMatch(adjustment, /await\s+load\(\{\s*silent:\s*true\s*\}\)/);
});

test('Delivery Today list loading aborts stale filter requests', () => {
  const source = read('public/js/app/new/91-delivery-today-new.js');
  const load = functionBody(source, 'load');
  assert.match(load, /AbortController/);
  assert.match(load, /state\.loadAbortController\.abort\(\)/);
  assert.match(load, /signal:\s*loadController\.signal/);
  assert.match(load, /AbortError/);
});

test('Mobile debt submit uses in-flight guard and form-scoped idempotency key', () => {
  const source = read('public/mobile/js/delivery-mobile-view.source.js');
  const submit = functionBody(source, 'submitDeliveryDebtCollectionFromDebtTab');
  assert.match(source, /async function runMobileCommandOnce/);
  assert.match(source, /debtFormIdempotencyKey\(customer\)/);
  assert.match(source, /name="idempotencyKey"/);
  assert.match(submit, /runMobileCommandOnce\('mobile\.debtCollection\.submit'/);
  assert.match(submit, /form\.get\('idempotencyKey'\)/);
  assert.doesNotMatch(submit, /Date\.now\(\).*Date\.now\(\)/);
});
