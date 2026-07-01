'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ArLedger = require('../src/models/ArLedger');
const DebtCollection = require('../src/models/DebtCollection');
const arBalanceService = require('../src/services/accounting/arBalanceService');
const mobileDebtQuery = require('../src/services/mobile/mobileDebtQuery.service');

function queryReturning(rows = []) {
  return {
    select() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => rows
  };
}

async function withRows({ arRows = [], pendingRows = [] }, callback) {
  const originalArFind = ArLedger.find;
  const originalDebtFind = DebtCollection.find;
  ArLedger.find = () => queryReturning(arRows);
  DebtCollection.find = () => queryReturning(pendingRows);
  try {
    return await callback();
  } finally {
    ArLedger.find = originalArFind;
    DebtCollection.find = originalDebtFind;
  }
}

function ledger(category, side, amount, extra = {}) {
  const debit = side === 'debit' ? amount : 0;
  const credit = side === 'credit' ? amount : 0;
  return {
    id: `${category}-${extra.orderCode || 'B115'}-${extra.id || amount}`,
    code: `${category}-${extra.orderCode || 'B115'}-${extra.id || amount}`,
    account: 'AR',
    category,
    ledgerType: category,
    type: category.toLowerCase().replace(/-/g, '_'),
    entryType: 'normal',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'posted',
    sourceType: extra.sourceType || 'SALES_ORDER_DELIVERY_CLOSEOUT',
    sourceId: extra.orderId || `SO-${extra.orderCode || 'B115'}`,
    sourceCode: extra.orderCode || 'B115',
    salesOrderId: extra.orderId || `SO-${extra.orderCode || 'B115'}`,
    salesOrderCode: extra.orderCode || 'B115',
    customerCode: extra.customerCode || 'C115',
    customerName: extra.customerName || 'Khách Phase115',
    salesStaffCode: extra.salesStaffCode || '33955',
    salesStaffName: extra.salesStaffName || 'Đỗ Thị Mừng',
    deliveryStaffCode: extra.deliveryStaffCode || 'ghtp',
    deliveryStaffName: extra.deliveryStaffName || 'Hiếu GH',
    debit,
    credit,
    amount,
    direction: side,
    amountField: side,
    idempotencyKey: `${category}:${extra.orderId || `SO-${extra.orderCode || 'B115'}`}:${extra.id || amount}`,
    date: extra.date || '2026-07-01',
    ...extra
  };
}

test('mobile customer list balance accepts primitive customer codes and confirmed AR-SALE/AR-RECEIPT rows', async () => {
  const rows = [
    ledger('AR-SALE', 'debit', 1000000, { orderCode: 'B115A' }),
    ledger('AR-RECEIPT', 'credit', 250000, { orderCode: 'B115A' }),
    ledger('AR-SALE', 'debit', 999999, { orderCode: 'B115B', accountingConfirmed: false })
  ];

  const result = await withRows({ arRows: rows }, () => arBalanceService.loadCustomerBalances(['C115']));
  assert.equal(result.get('c115'), 750000);
});

test('mobile debt tab reads both AR-DEBT-* and legacy canonical AR rows under sales staff scope', async () => {
  const rows = [
    ledger('AR-SALE', 'debit', 1000000, { orderCode: 'B115A' }),
    ledger('AR-RECEIPT', 'credit', 250000, { orderCode: 'B115A', salesStaffCode: '', salesStaffName: '' }),
    ledger('AR-DEBT-OPEN', 'debit', 500000, { orderCode: 'B115B' }),
    ledger('AR-DEBT-PAYMENT', 'credit', 100000, { orderCode: 'B115B', salesStaffCode: '', salesStaffName: '' }),
    ledger('AR-RETURN', 'credit', 50000, { orderCode: 'B115B', salesStaffCode: '', salesStaffName: '' }),
    ledger('AR-SALE', 'debit', 999999, { orderCode: 'B115C', reversed: true }),
    ledger('AR-SALE', 'debit', 999999, { orderCode: 'B115D', accountingConfirmed: false }),
    ledger('AR-SALE', 'debit', 999999, { orderCode: 'B115E', active: false })
  ];

  const result = await withRows({ arRows: rows }, () => mobileDebtQuery.getMobileCustomerDebts({
    salesStaffCode: '33955',
    includePaid: '0',
    page: 1,
    limit: 30
  }));

  assert.equal(result.ok, true);
  assert.equal(result.source, 'mobile-ar-ledger-canonical');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].customerCode, 'C115');
  assert.equal(result.items[0].debtAmount, 1100000);
  assert.equal(result.items[0].orders.length, 2);
  assert.equal(result.summary.totalDebt, 1100000);
  assert.equal(result.summary.readModelVersion, 'mobile-canonical-ar-ledger-v3');
});

test('mobile canonical AR filter is confirmed, active and category-bound', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/services/mobile/mobileDebtQuery.service.js'), 'utf8');
  assert.match(source, /buildConfirmedArLedgerFilter/);
  assert.match(source, /MOBILE_AR_DEBT_CATEGORIES/);
  assert.match(source, /accountingConfirmed/);
  assert.match(source, /active:\s*\{\s*\$ne:\s*false\s*\}/);
  assert.doesNotMatch(source, /salesOrders\.remainingDebt|master_orders CN/);
});
