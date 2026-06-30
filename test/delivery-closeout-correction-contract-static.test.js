'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('Phase92 correction service is immutable and does not call legacy return/reversal/inventory flows', () => {
  const service = read('src/services/deliveryCloseoutCorrection.service.js');
  const legacyFacade = read('src/services/accounting/DeliveryCloseoutCorrectionService.js');
  assert.match(legacyFacade, /deliveryCloseoutCorrection\.service/);

  const forbidden = [
    'ReturnArPostingService',
    'ReturnOrderService',
    'returnOrderRepository',
    'InventoryPostingService',
    'postReturnIn',
    'postSalesOrderAR',
    'postReceiptAR',
    "category: 'AR-RETURN'",
    "category: 'AR-SALE-REVERSAL'",
    'orderRepository.upsert',
    'patchByIdentity',
    'salesOrders.remainingDebt'
  ];
  for (const token of forbidden) assert.equal(service.includes(token), false, `Forbidden token in correction service: ${token}`);

  assert.match(service, /DeliveryCloseoutCorrection/);
  assert.match(service, /DeliveryCloseoutVersion/);
  assert.match(service, /ArDebtAdjustmentPostingService\.postAdjustment/);
  assert.match(service, /debtAdjustmentAmount[\s\S]*-[\s\S]*returnAdjustmentAmount[\s\S]*-[\s\S]*cashAdjustmentAmount/);
});

test('Phase92 route exposes correction and version endpoints under /api/new delivery today', () => {
  const route = read('src/routes/newOperationsRoutes.js');
  assert.match(route, /delivery-today\/closeouts\/:id\/corrections/);
  assert.match(route, /delivery-today\/closeouts\/:id\/versions/);
  assert.match(route, /deliveryCloseoutCorrectionService\.createCorrection/);
});

test('Phase92 AR-DEBT-ADJUSTMENT contract uses correction source and canonical debit credit', () => {
  const posting = read('src/services/accounting/ArDebtAdjustmentPostingService.js');
  assert.match(posting, /category:\s*'AR-DEBT-ADJUSTMENT'/);
  assert.match(posting, /ledgerType:\s*'AR-DEBT-ADJUSTMENT'/);
  assert.match(posting, /entryType:\s*'normal'/);
  assert.match(posting, /sourceType/);
  assert.match(posting, /DELIVERY_CLOSEOUT_CORRECTION/);
  assert.match(posting, /correctionId/);
  assert.match(posting, /originalCloseoutId/);
  assert.match(posting, /newCloseoutId/);
});

test('Phase93 Debt New keeps AR-DEBT categories only and groups correction ledgers back to the sales order', () => {
  const debtNew = read('src/services/v2/debtNew.service.js');
  assert.match(debtNew, /AR-DEBT-OPEN/);
  assert.match(debtNew, /AR-DEBT-PAYMENT/);
  assert.match(debtNew, /AR-DEBT-ADJUSTMENT/);
  assert.match(debtNew, /AR-DEBT-VOID/);
  assert.match(debtNew, /sourceType === 'DELIVERY_CLOSEOUT_CORRECTION'/);
  assert.match(debtNew, /salesOrderId \|\| row\.orderId/);
  assert.equal(/AR-SALE['"]\s*,\s*['"]AR-SALE-REVERSAL/.test(debtNew), true);
});

test('Phase92 scripts exist for index, audit, consistency audit and repair planning', () => {
  [
    'scripts/create-delivery-closeout-correction-indexes.js',
    'scripts/audit-delivery-closeout-corrections.js',
    'scripts/audit-new-delivery-debt-consistency.js',
    'scripts/plan-new-delivery-debt-repair.js'
  ].forEach((rel) => assert.equal(fs.existsSync(path.join(root, rel)), true, `${rel} missing`));
});
