'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { readSource } = require('./helpers/sourceBundle.util');

const service = readSource(path.join(__dirname, '..', 'src/services/admin-correction/AdminDataCorrectionService.js'));
const arAdjustmentService = readSource(path.join(__dirname, '..', 'src/services/accounting/arAdjustmentService.js'));
const policy = readSource(path.join(__dirname, '..', 'src/policies/adminCorrectionPolicy.js'));
const routes = readSource(path.join(__dirname, '..', 'src/routes/adminCorrectionRoutes.js'));
const indexRoutes = readSource(path.join(__dirname, '..', 'src/routes/index.js'));
const diffUtil = readSource(path.join(__dirname, '..', 'src/utils/adminCorrectionDiff.util.js'));
const ui = readSource(path.join(__dirname, '..', 'public/js/app/admin/08g-data-corrections.js'));
const fragment = readSource(path.join(__dirname, '..', 'public/fragments/index/06-index-body.html'));


test('admin data correction API is mounted under /api/admin', () => {
  assert.match(indexRoutes, /adminCorrectionRoutes/);
  assert.match(indexRoutes, /app\.use\('\/api\/admin',\s*adminCorrectionRoutes\)/);
  assert.match(routes, /router\.post\('\/corrections'/);
  assert.match(routes, /router\.post\('\/corrections\/:id\/rollback'/);
  assert.match(routes, /router\.post\('\/entities\/:entityType\/:id\/validate-change'/);
});

test('high risk fields require ledger adjustment and are not direct-write', () => {
  assert.match(policy, /HIGH_RISK_FIELDS/);
  assert.match(policy, /availableQty/);
  assert.match(policy, /receivableAmount/);
  assert.match(policy, /stockPosted/);
  assert.match(policy, /directWriteAllowed:\s*false/);
  assert.match(service, /Dữ liệu rủi ro cao hoặc đã phát sinh ledger không được update trực tiếp/);
});

test('inventory, AR and fund corrections create adjustment records and ledger rows', () => {
  assert.match(service, /InventoryAdjustment\.create/);
  assert.match(service, /inventoryService\.postStockMovement/);
  assert.match(service, /sourceType:\s*'ADMIN_CORRECTION'/);
  assert.match(service, /arAdjustmentService\.createArAdjustment/);
  assert.match(arAdjustmentService, /ArAdjustment\.create/);
  assert.match(arAdjustmentService, /ArLedger\.create/);
  assert.match(service, /FundAdjustment\.create/);
  assert.match(service, /FundLedger\.create/);
});

test('inventory correction does not create orphan stock transaction without updating current inventory', () => {
  assert.doesNotMatch(service, /StockTransaction\.create\(\[tx\]/);
  assert.match(service, /postStockMovement\(\{[\s\S]*items:/);
  assert.match(service, /postStockMovement\(\{[\s\S]*quantity:\s*Math\.abs\(adjustQty\)/);
});

test('rollback is implemented as reversal, not deleting old ledger rows', () => {
  assert.match(service, /createRollbackLedger/);
  assert.match(service, /patch\.adjustQty\s*=\s*-toNumber/);
  assert.match(service, /arAdjustmentService\.rollbackArAdjustment/);
  assert.match(arAdjustmentService, /amount:\s*-roundAmount/);
  assert.doesNotMatch(service, /deleteMany\(/);
  assert.doesNotMatch(service, /remove\(/);
});

test('diff helper exists for before-after snapshots', () => {
  assert.match(diffUtil, /function buildObjectDiff/);
  assert.match(diffUtil, /function applyPatch/);
  assert.match(diffUtil, /function pickPatchFromDiff/);
});

test('admin correction UI is available and requires reason plus JSON patch', () => {
  assert.match(fragment, /adminCorrectionsTab/);
  assert.match(fragment, /Trung tâm chỉnh sửa số liệu/);
  assert.match(ui, /\/api\/admin\/corrections/);
  assert.match(ui, /Patch JSON không hợp lệ/);
  assert.match(ui, /reason/);
});
