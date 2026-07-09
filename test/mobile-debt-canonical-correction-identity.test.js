'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const {
  isCloseoutCorrectionKey,
  extractSalesOrderIdFromCloseoutCorrectionKey,
  canonicalDebtOrderIdentity
} = require('../src/utils/debtOrderIdentity.util');
const DebtNewService = require('../src/services/v2/debtNew.service');
const MobileDebtNewAdapter = require('../src/services/mobile/mobileDebtNewAdapter.service');
const DebtReadService = require('../src/services/DebtReadService');
const ArLedger = require('../src/models/ArLedger');
const DebtCollection = require('../src/models/DebtCollection');

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function queryMock(rows) {
  return {
    select() { return this; },
    limit() { return this; },
    session() { return this; },
    lean() { return Promise.resolve(rows); }
  };
}

function arLedger(overrides = {}) {
  return {
    account: 'AR',
    category: 'AR-DEBT-OPEN',
    ledgerType: 'AR-DEBT-OPEN',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    isDeleted: false,
    deleted: false,
    status: 'posted',
    customerCode: '4501102',
    customerName: 'Tuấn Anh',
    salesOrderId: 'SO1782984458453379',
    orderId: 'SO1782984458453379',
    salesOrderCode: 'B0038757',
    orderCode: 'B0038757',
    sourceId: 'SO1782984458453379',
    sourceCode: 'B0038757',
    debit: 48697883,
    credit: 0,
    amount: 48697883,
    salesStaffCode: '35093',
    salesStaffName: 'NVBH Test',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'NVGH Test',
    date: '2026-07-03',
    id: 'AR-DEBT-OPEN-B0038757',
    code: 'AR-DEBT-OPEN-B0038757',
    ...overrides
  };
}

test('canonicalDebtOrderIdentity treats DCOC as correction audit key and extracts SO id', () => {
  const correctionCode = 'DCOC-SO1782984458453379-2-7536458ffff8b';
  assert.equal(isCloseoutCorrectionKey(correctionCode), true);
  assert.equal(extractSalesOrderIdFromCloseoutCorrectionKey(correctionCode), 'SO1782984458453379');

  const identity = canonicalDebtOrderIdentity({ sourceCode: correctionCode });
  assert.equal(identity.salesOrderCode, 'SO1782984458453379');
  assert.equal(identity.canonicalOrderKey, 'SO1782984458453379');
  assert.equal(identity.correctionSourceCode, correctionCode);
  assert.equal(isCloseoutCorrectionKey(identity.salesOrderCode), false);
});

test('DebtNew and mobile adapter do not expose DCOC as salesOrderCode/orderCode when original order exists', () => {
  const correctionCode = 'DCOC-SO1782984458453379-2-7536458ffff8b';
  const grouped = DebtNewService.groupLedgers([
    arLedger({
      category: 'AR-DEBT-ADJUSTMENT',
      ledgerType: 'AR-DEBT-ADJUSTMENT',
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
      sourceId: correctionCode,
      sourceCode: correctionCode,
      correctionId: correctionCode,
      correctionCode,
      credit: 0,
      amount: 0,
      id: 'AR-DEBT-ADJUSTMENT-DCOC',
      code: 'AR-DEBT-ADJUSTMENT-DCOC'
    }),
    arLedger()
  ], { status: 'open' });

  assert.equal(grouped.orders.length, 1);
  const debtOrder = grouped.orders[0];
  assert.equal(debtOrder.salesOrderCode, 'B0038757');
  assert.equal(debtOrder.orderCode, 'B0038757');
  assert.equal(debtOrder.canonicalOrderKey, 'SO1782984458453379');
  assert.equal(debtOrder.correctionSourceCode, correctionCode);
  assert.equal(isCloseoutCorrectionKey(debtOrder.salesOrderCode), false);

  const mobileOrder = MobileDebtNewAdapter._internal.mapDebtNewOrderToMobile(debtOrder, {});
  assert.equal(mobileOrder.salesOrderCode, 'B0038757');
  assert.equal(mobileOrder.orderCode, 'B0038757');
  assert.equal(mobileOrder.correctionSourceCode, correctionCode);
  assert.equal(isCloseoutCorrectionKey(mobileOrder.salesOrderCode), false);
});

test('DebtReadService validates multi-order mobile collection when allocation sends DCOC plus canonical salesOrderId', async () => {
  const correctionCode = 'DCOC-SO1782984458453379-2-7536458ffff8b';
  const originalArFind = ArLedger.find;
  const originalDebtCollectionFind = DebtCollection.find;
  ArLedger.find = () => queryMock([
    arLedger(),
    arLedger({
      salesOrderId: 'SO-B0038742',
      orderId: 'SO-B0038742',
      salesOrderCode: 'B0038742',
      orderCode: 'B0038742',
      sourceId: 'SO-B0038742',
      sourceCode: 'B0038742',
      debit: 238328,
      amount: 238328,
      id: 'AR-DEBT-OPEN-B0038742',
      code: 'AR-DEBT-OPEN-B0038742'
    })
  ]);
  DebtCollection.find = () => queryMock([]);

  try {
    const result = await DebtReadService.checkAvailableDebt({
      customerCode: '4501102',
      allocations: [
        {
          salesOrderCode: correctionCode,
          salesOrderId: 'SO1782984458453379',
          sourceCode: correctionCode,
          allocatedAmount: 48697883,
          availableDebt: 48697883
        },
        {
          salesOrderCode: 'B0038742',
          salesOrderId: 'SO-B0038742',
          allocatedAmount: 238328,
          availableDebt: 238328
        }
      ]
    });

    assert.equal(result.ok, true);
    assert.equal(result.allocatedAmount, 48936211);
    assert.equal(result.allocations.length, 2);
    assert.equal(result.allocations[0].salesOrderCode, 'B0038757');
    assert.equal(result.allocations[0].canonicalOrderKey, 'SO1782984458453379');
    assert.equal(result.allocations[0].correctionSourceCode, correctionCode);
    assert.equal(result.allocations[1].salesOrderCode, 'B0038742');
  } finally {
    ArLedger.find = originalArFind;
    DebtCollection.find = originalDebtCollectionFind;
  }
});

test('mobile debt submit source bundle keeps correction key out of salesOrderCode allocation field', () => {
  const source = readSource('public/mobile/js/delivery-mobile-view.source.js');
  const start = source.indexOf('function submitDeliveryDebtCollectionFromDebtTab');
  const block = source.slice(start, source.indexOf('var totalSelected', start));
  assert.match(source, /function mobileDebtOrderIdentity\(order\)/);
  assert.match(block, /var debtIdentity = mobileDebtOrderIdentity\(order\);/);
  assert.match(block, /salesOrderCode: debtIdentity\.salesOrderCode/);
  assert.match(block, /sourceCode: debtIdentity\.sourceCode/);
  assert.doesNotMatch(block, /salesOrderCode:\s*order\.salesOrderCode \|\| order\.orderCode/);
});
