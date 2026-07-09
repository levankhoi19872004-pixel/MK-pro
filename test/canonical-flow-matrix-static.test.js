'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const flows = require('../config/canonical-flows.json');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Phase217 canonical flow matrix exists and covers all required P0/P1/P2 owners', () => {
  const doc = read('docs/CANONICAL_FLOW_MATRIX.md');
  const required = [
    'authAndRole','productCatalog','customerCatalog','webSalesOrder','mobileSalesOrder',
    'salesImportPreviewCommit','dmsInventoryComparison','dmsGapSimulator','displayCheckManager',
    'masterOrder','deliveryMobilePhase23Workflow','deliveryTodayNewOrders','deliveryCloseout',
    'deliveryAdjustment','deliveryAdjustmentBulkCommit','debtNew','mobileDebt','debtCollectionSubmit',
    'debtCollectionConfirm','fundLedger','returnOrders','warehouseReturnCheck','returnStockInAccounting',
    'reportCenter','sseExportByDeliveryStaff','vatExport','backup','resetData','enterpriseConsole'
  ];
  required.forEach((id) => {
    assert.ok(flows[id], `${id} must be declared in canonical-flows.json`);
    assert.match(doc, new RegExp(`## ${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });
});

test('each canonical flow has frontend entries, routes, services and SSoT collections', () => {
  Object.entries(flows).forEach(([id, flow]) => {
    assert.equal(flow.status, 'canonical', `${id} should be canonical`);
    assert.ok(Array.isArray(flow.frontendEntries) && flow.frontendEntries.length, `${id} needs frontendEntries`);
    assert.ok(Array.isArray(flow.routes) && flow.routes.length, `${id} needs routes`);
    assert.ok(Array.isArray(flow.services) && flow.services.length, `${id} needs services`);
    assert.ok(Array.isArray(flow.ssotCollections) && flow.ssotCollections.length, `${id} needs ssotCollections`);
    assert.ok(flow.owner, `${id} needs owner`);
  });
});

test('canonical flow config protects hard SSoT decisions', () => {
  assert.ok(flows.debtNew.forbiddenSources.join('\n').includes('orders as debt SSoT'));
  assert.ok(flows.mobileDebt.forbiddenSources.join('\n').includes('DCOC'));
  assert.ok(flows.deliveryCloseout.forbiddenSources.join('\n').includes('master_orders.totalAmount'));
  assert.ok(flows.returnOrders.retiredAlternatives.includes('master-return-orders-write-flow'));
  assert.ok(flows.returnStockInAccounting.forbiddenSources.join('\n').includes('warehouse mobile direct stockTransactions'));
});
