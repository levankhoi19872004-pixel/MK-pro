'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function bodyOf(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const next = source.indexOf('\nasync function ', start + 20);
  return source.slice(start, next === -1 ? source.length : next);
}

test('Phase215 P1 action contracts cover import DMS SSE backup reset return and warehouse commands', () => {
  const { ACTION_COMMAND_CONTRACTS } = require('../src/config/actionCommandContracts');
  const required = ['importCommit', 'dmsInventoryCommit', 'sseExport', 'systemBackup', 'systemReset', 'returnStockIn', 'warehouseReturnConfirm'];
  for (const key of required) {
    const contract = ACTION_COMMAND_CONTRACTS[key];
    assert.ok(contract, `${key} missing`);
    assert.equal(contract.requestBudget, 1, `${key} must be one command request`);
    assert.ok(contract.idempotencyKey, `${key} idempotency missing`);
    assert.ok(Array.isArray(contract.allowedWrites), `${key} allowedWrites missing`);
    assert.ok(Array.isArray(contract.forbiddenWrites), `${key} forbiddenWrites missing`);
  }
  assert.deepEqual(ACTION_COMMAND_CONTRACTS.sseExport.allowedWrites, [], 'direct SSE export must not write DB');
  assert.ok(ACTION_COMMAND_CONTRACTS.systemReset.isDangerous, 'reset must be marked dangerous');
  assert.ok(ACTION_COMMAND_CONTRACTS.warehouseReturnConfirm.forbiddenWrites.includes('stockTransactions'));
});

test('Action Contract Matrix documents Phase215 P1 request budgets and forbidden side effects', () => {
  const doc = read('docs/ACTION_CONTRACT_MATRIX.md');
  ['Import các dòng đã chọn', 'Xác nhận cập nhật hạn mức bán App DMS', 'Xuất Excel SSE', 'Tạo backup', 'Reset dữ liệu', 'Nhập kho đơn trả', 'Thủ kho xác nhận hàng trả']
    .forEach((label) => assert.match(doc, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(doc, /bounded polling|polling có AbortController/i);
  assert.match(doc, /Không ghi DB trong direct export/i);
  assert.match(doc, /Không reload toàn bộ hệ thống/i);
});

test('Import commit frontend has in-flight lock and abortable bounded polling', () => {
  const source = read('public/js/app/admin/08d-import-excel.source/part-03.jsfrag');
  assert.match(source, /const importCommandLocks=new Set\(\)/);
  assert.match(source, /runImportCommandOnce\('import\.commit',commitImportExcelCore\)/);
  assert.match(source, /let importCommitPollController=null/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /signal:pollController\.signal/);
  assert.match(source, /stopImportCommitPolling\(\)/);
  const commit = bodyOf(source, 'commitImportExcelCore');
  assert.match(commit, /fetch\(commitUrl,\{/);
  assert.doesNotMatch(commit, /for\s*\([^)]*selectedRows[^)]*\)\s*\{[^}]*fetch/s, 'commit must not call per-row commit APIs');
});

test('DMS commit frontend is a single locked command and list/history reads are abortable', () => {
  const source = read('public/js/app/10-dms-inventory.js');
  assert.match(source, /const dmsCommandLocks=new Set\(\)/);
  assert.match(source, /runDmsCommandOnce\('dms\.commit',commitPreviewCore\)/);
  assert.match(source, /fetch\(`\/api\/dms-inventory\/\$\{encodeURIComponent\(state\.preview\.importId\)\}\/commit`/);
  assert.match(source, /loadAbortController/);
  assert.match(source, /historyAbortController/);
  assert.match(source, /signal:loadController\.signal/);
  assert.match(source, /signal:historyController\.signal/);
});

test('System backup/reset frontend uses command locks and avoids full module cascade reload after reset', () => {
  const source = read('public/js/app/09-system.js');
  assert.match(source, /const systemCommandLocks=new Set\(\)/);
  assert.match(source, /runSystemCommandOnce\('system\.backup',createSystemBackupCore\)/);
  assert.match(source, /runSystemCommandOnce\('system\.reset',resetSystemDataCore\)/);
  const reset = bodyOf(source, 'resetSystemDataCore');
  assert.doesNotMatch(reset, /loadProducts\(|loadCustomers\(|loadStock\(|loadSalesOrders\(|loadDebts\(/, 'reset must not cascade reload every module');
});

test('P1 backend command endpoints expose telemetry without breaking boundaries', () => {
  const importController = read('src/controllers/importExportController.js');
  const importRuntime = read('src/controllers/importRuntimeController.js');
  const dms = read('src/controllers/dmsInventoryController.js');
  const system = read('src/controllers/systemController.js');
  const returns = read('src/controllers/returnOrderController.js');
  const warehouse = read('src/services/mobile/warehouseReturnCheck.service.js');
  assert.match(importController, /createCommandTelemetry\('import\.commit'\)/);
  assert.match(importRuntime, /createCommandTelemetry\('import\.runtime\.commit'\)/);
  assert.match(importController, /createCommandTelemetry\([^)]*sse\.export/);
  assert.match(dms, /createCommandTelemetry\('dmsInventory\.commit'\)/);
  assert.match(system, /createCommandTelemetry\('system\.backup'\)/);
  assert.match(system, /createCommandTelemetry\('system\.reset'\)/);
  assert.match(returns, /createCommandTelemetry\('return\.stockIn'\)/);
  assert.match(warehouse, /createCommandTelemetry\('warehouse\.returnConfirm'\)/);
  assert.doesNotMatch(warehouse, /require\([^)]*StockTransaction|stockTransactions\.create|inventor(?:y|ies)\.update/i, 'warehouse confirm must not post stock directly');
});
