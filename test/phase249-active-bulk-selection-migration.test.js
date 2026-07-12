'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const debt = read('public/js/app/new/92-debt-new.js');
const importModal = read('public/js/app/admin/08d-import-excel.source/part-01b.jsfrag');
const importControls = read('public/js/app/admin/08d-import-excel.source/part-02.jsfrag');
const sales = read('public/js/app/05-sales-orders.source/part-03.jsfrag');
const salesExport = read('public/js/app/05-sales-orders.source/part-04.jsfrag');
const masters = read('public/js/app/06-master-delivery.js');
const fragment2 = read('public/fragments/index/02-index-body.html');
const fragment3 = read('public/fragments/index/03-index-body.html');

test('Debt New and import preview each expose one contextual toggle', () => {
  assert.match(debt, /id="debtNewToggleDebtOrders"[^>]*data-selection-scope="debt-order-list"/);
  assert.doesNotMatch(debt, /debtNewSelectAllDebtOrders|debtNewClearDebtOrders/);
  assert.match(importModal, /id="toggleAllImportPreviewButton"[^>]*data-selection-scope="import-preview-valid-rows"/);
  assert.doesNotMatch(importModal + importControls, /selectAllImportPreviewButton|clearAllImportPreviewButton/);
  assert.match(importControls, /toggleScopeSelection/);
  assert.doesNotMatch(importControls, /document\.querySelectorAll\('\.import-modal-row-check/);
});

test('sales and master-order screens use state-scoped toggles and scoped payload selection', () => {
  assert.match(fragment2, /data-selection-scope="sales-order-list"/);
  assert.match(fragment2, /data-selection-scope="master-order-list"/);
  assert.match(fragment3, /data-selection-scope="master-unmerged-child-list"/);
  assert.match(sales, /ensureSelectedSalesOrderKeys/);
  assert.match(sales, /toggleScopeSelection/);
  assert.doesNotMatch(sales + salesExport, /document\.querySelectorAll\('\.sales-order-check/);
  assert.match(masters, /deriveUnmergedOrderBulkSelectionState/);
  assert.match(masters, /deriveMasterOrderBulkSelectionState/);
  assert.match(masters, /applyToggleButtonState/);
});

test('governance audit passes and reports the P2 inventory explicitly', () => {
  const result = spawnSync(process.execPath, ['scripts/audit-scoped-bulk-selection.js'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /OK 6 governed scopes/);
  assert.match(result.stdout, /P2/);
});
