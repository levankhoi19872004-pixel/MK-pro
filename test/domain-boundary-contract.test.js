'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function assertExports(source, names) {
  for (const name of names) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `Expected export/contract member ${name}`);
  }
}

test('domain boundary files exist and expose required lifecycle/posting contracts', () => {
  const contracts = [
    ['src/domain/posting/ArPostingService.js', ['postSale', 'postReceipt', 'postReturn', 'postReturnAllocations', 'reverseReceipt', 'reverseSale', 'reverseReturn', 'postBatch', 'markReversed']],
    ['src/domain/posting/InventoryPostingService.js', ['postImportIn', 'postSaleOut', 'postReturnIn', 'reverseMovement', 'reconcileInventory']],
    ['src/domain/lifecycle/ReturnLifecycleService.js', ['createPendingReturn', 'confirmReceive', 'confirmAccounting', 'postReturnStock', 'postReturnAR']],
    ['src/domain/settlement/DeliverySettlementService.js', ['recordCollectedMoney', 'confirmAccounting', 'unlockAccounting', 'submitCashToFund', 'cashInTransitReport']],
    ['src/domain/lifecycle/SalesLifecycleService.js', ['createOrder', 'updateOrder', 'cancelOrder', 'confirmDelivery', 'reverseCancelledOrderIfNeeded']]
  ];

  for (const [relPath, exports] of contracts) {
    const fullPath = path.join(ROOT, relPath);
    assert.equal(fs.existsSync(fullPath), true, `${relPath} must exist`);
    assertExports(read(relPath), exports);
  }
});

test('domain boundaries delegate to the intended posting/lifecycle services', () => {
  const ar = read('src/domain/posting/ArPostingService.js');
  assert.match(ar, /postingEngine\.postSalesOrderAR\(order, options\)/);
  assert.match(ar, /postingEngine\.postReceiptAR\(receipt, options\)/);
  assert.match(ar, /postingEngine\.postReturnOrderAR\(returnOrder, options\)/);

  const inventory = read('src/domain/posting/InventoryPostingService.js');
  assert.match(inventory, /inventoryService\.postStockMovement\(order, \{/);
  assert.match(inventory, /inventoryService\.postStockMovement\(returnOrder, \{/);
  assert.match(inventory, /inventoryService\.reverseStockMovement\(document, movement, options\)/);

  const returns = read('src/domain/lifecycle/ReturnLifecycleService.js');
  assert.match(returns, /returnOrderService\.createPendingReturnOrder\(body, options\)/);
  assert.match(returns, /returnOrderService\.upsertDeliveryReturnOrder\(body, options\)/);
  assert.match(returns, /InventoryPostingService\.postReturnIn\(returnOrder, options\)/);
  assert.match(returns, /ArPostingService\.postReturn\(\{/);

  const settlement = read('src/domain/settlement/DeliverySettlementService.js');
  assert.match(settlement, /ArPostingService\.postReceipt\(\{/);
  assert.match(settlement, /fundService\.confirmDeliveryCashSubmission\(/);
  assert.match(settlement, /DeliveryCashInTransitReportService\.listDeliveryCashInTransit\(query\)/);
  assert.doesNotMatch(settlement, /fundService\.buildDeliverySubmissionDraft\(query\)/);

  const sales = read('src/domain/lifecycle/SalesLifecycleService.js');
  assert.match(sales, /getOrderService\(\)\.createOrder\(body, options\)/);
  assert.match(sales, /getOrderService\(\)\.cancelOrder\(idOrCode, body, options\)/);
  assert.match(sales, /InventoryPostingService\.postSaleOut\(order, options\)/);
});

test('master-order accounting strangler keeps legacy fallback and ENV-gated domain path', () => {
  const source = read('src/services/master-order/masterOrderAccounting.service.js');

  assert.match(source, /const legacy = require\('\.\/masterOrderLegacy\.service'\)/);
  assert.match(source, /DeliverySettlementService/);
  assert.match(source, /process\.env\.USE_NEW_DELIVERY_SETTLEMENT/);
  assert.match(source, /DeliverySettlementService\.confirmAccounting\(\.\.\.args\)/);
  assert.match(source, /legacy\.confirmDeliveryAccounting\(\.\.\.args\)/);
  assert.match(source, /DeliverySettlementService\.unlockAccounting\(\.\.\.args\)/);
  assert.match(source, /legacy\.adminUnlockDeliveryAccounting\(\.\.\.args\)/);
});

test('domain boundaries avoid known circular dependency traps', () => {
  const settlement = read('src/domain/settlement/DeliverySettlementService.js');
  assert.match(settlement, /require\('\.\.\/\.\.\/services\/master-order\/masterOrderLegacy\.service'\)/);
  assert.doesNotMatch(settlement, /require\('\.\.\/\.\.\/services\/masterOrderService'\)/);

  const returns = read('src/domain/lifecycle/ReturnLifecycleService.js');
  assert.match(returns, /function getReturnOrderService\(\)/);
  assert.doesNotMatch(returns, /const returnOrderService = require\('\.\.\/\.\.\/services\/returnOrderService'\)/);

  const sales = read('src/domain/lifecycle/SalesLifecycleService.js');
  assert.match(sales, /function getOrderService\(\)/);
  assert.doesNotMatch(sales, /const orderService = require\('\.\.\/\.\.\/services\/orderService'\)/);
});
