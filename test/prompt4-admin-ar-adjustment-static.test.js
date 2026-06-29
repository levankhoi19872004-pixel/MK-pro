'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const adminService = fs.readFileSync(path.join(ROOT, 'src/services/admin-correction/AdminDataCorrectionService.js'), 'utf8');
const arAdjustmentService = fs.readFileSync(path.join(ROOT, 'src/services/accounting/arAdjustmentService.js'), 'utf8');
const indexService = fs.readFileSync(path.join(ROOT, 'src/services/mongoIndexService.js'), 'utf8');
const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');

test('AdminDataCorrectionService không còn ghi AR trực tiếp thiếu idempotency', () => {
  assert.doesNotMatch(adminService, /ArLedger\.create\s*\(/);
  assert.match(adminService, /arAdjustmentService\.createArAdjustment/);
  assert.match(adminService, /arAdjustmentService\.rollbackArAdjustment/);
});

test('arAdjustmentService là writer boundary có idempotency, auditTrail và rollback', () => {
  assert.match(arAdjustmentService, /function buildAdjustmentIdempotencyKey/);
  assert.match(arAdjustmentService, /findExistingAdjustment/);
  assert.match(arAdjustmentService, /P0_AR_ADJUSTMENT_CONFLICT/);
  assert.match(arAdjustmentService, /auditTrail/);
  assert.match(arAdjustmentService, /rollbackArAdjustment/);
  assert.match(arAdjustmentService, /LEDGER_TYPE\}-ROLLBACK/);
});

test('mongo index tầng 1 và scripts audit/index cho AR adjustment tồn tại', () => {
  assert.match(indexService, /idx_ar_adjustment_source_lookup/);
  assert.match(indexService, /idx_ar_adjustment_correction_lookup/);
  assert.match(packageJson, /audit:ar-adjustment-idempotency/);
  assert.match(packageJson, /mongo:ar-adjustment-unique-index/);
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/audit-ar-adjustment-idempotency.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/create-ar-adjustment-unique-index.js')));
});
