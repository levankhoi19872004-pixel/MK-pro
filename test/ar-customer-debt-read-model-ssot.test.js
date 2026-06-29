'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCustomerDebtReadModelFromLedgers,
  canonicalOrderKey,
  normalizeArCategory
} = require('../src/services/accounting/arCustomerDebtReadModel.service');

function baseLedger(overrides = {}) {
  return {
    account: 'AR',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    status: 'posted',
    tenantId: '',
    customerCode: '4501256',
    customerId: '6a257c883527e67aa4a8cc74',
    customerName: 'Chị Sen',
    date: '2026-06-29',
    orderId: 'SO178255038016695',
    orderCode: 'B0038424',
    salesOrderId: 'SO178255038016695',
    salesOrderCode: 'B0038424',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'Thành GH Tiền hải',
    salesStaffCode: '35095',
    salesStaffName: 'Nguyễn Đình Thành',
    debit: 0,
    credit: 0,
    amount: 0,
    ...overrides
  };
}

function b0038424Fixture() {
  return [
    baseLedger({
      _id: 'sale-ledger',
      id: 'AR-SALE-B0038424',
      code: 'AR-SALE-B0038424',
      category: 'AR-SALE',
      ledgerType: 'AR-SALE',
      type: 'ar_sale',
      debit: 5141521,
      amount: 5141521,
      direction: 'debit'
    }),
    baseLedger({
      _id: 'receipt-ledger',
      id: 'AR-RECEIPT-B0038424',
      code: 'AR-RECEIPT-B0038424',
      category: 'AR-RECEIPT',
      ledgerType: 'AR-RECEIPT',
      type: 'ar_receipt',
      credit: 4864000,
      amount: 4864000,
      direction: 'credit'
    }),
    baseLedger({
      _id: 'return-ledger',
      id: 'AR-RETURN-RO-B0038424-ACC-SO178255038016695-1782746702140',
      code: 'AR-RETURN-RO-B0038424-ACC-SO178255038016695-1782746702140',
      category: 'AR-RETURN',
      ledgerType: 'AR-RETURN',
      type: 'ar_return',
      accountingBatchId: 'ACC-SO178255038016695-1782746702140',
      orderId: 'SO178255038016695',
      orderCode: 'B0038424',
      salesOrderId: 'SO178255038016695',
      salesOrderCode: 'B0038424',
      sourceOrderId: 'SO178255038016695',
      sourceOrderCode: 'B0038424',
      returnOrderId: 'RO-B0038424',
      returnOrderCode: 'RO-B0038424',
      sourceId: 'RO-B0038424',
      sourceCode: 'RO-B0038424',
      source: 'returnOrders',
      sourceModel: 'returnOrders',
      sourceType: 'returnOrder',
      refType: 'RETURN_ORDER',
      refId: 'RO-B0038424',
      refCode: 'RO-B0038424',
      idempotencyKey: 'AR-RETURN:RO-B0038424',
      credit: 276632,
      amount: 276632,
      direction: 'credit'
    })
  ];
}

test('AR customer debt read model groups RO-B0038424 AR-RETURN into B0038424 and applies tolerance', () => {
  const report = buildCustomerDebtReadModelFromLedgers(b0038424Fixture(), { status: 'all', q: '4501256' }, { today: '2026-06-29' });

  assert.equal(report.debugSource.source, 'arLedgers');
  assert.equal(report.debugSource.usesSnapshot, false);
  assert.equal(report.orders.length, 1);

  const order = report.orders[0];
  assert.equal(order.orderKey, 'SO178255038016695');
  assert.equal(order.orderCode, 'B0038424');
  assert.equal(order.arSaleAmount, 5141521);
  assert.equal(order.receiptAmount, 4864000);
  assert.equal(order.returnAmount, 276632);
  assert.equal(order.totalDebit, 5141521);
  assert.equal(order.totalCredit, 5140632);
  assert.equal(order.remainingDebt, 889);
  assert.equal(order.remainingDebtDisplay, 0);
  assert.equal(order.debt, 0);
  assert.equal(order.debtStatus, 'settled_by_tolerance');
  assert.deepEqual(order.ledgerIds, ['sale-ledger', 'receipt-ledger', 'return-ledger']);

  const customer = report.customers[0];
  assert.equal(customer.customerCode, '4501256');
  assert.equal(customer.debt, 0);
  assert.equal(customer.rawDebt, 889);
  assert.equal(customer.orders[0].returnAmount, 276632);
});

test('AR customer debt read model excludes settled tolerance rows from Khách còn nợ', () => {
  const report = buildCustomerDebtReadModelFromLedgers(b0038424Fixture(), { status: '', q: '4501256' }, { today: '2026-06-29' });
  assert.equal(report.orders.length, 0);
  assert.equal(report.customers.length, 0);
  assert.equal(report.summary.orderDebtCount, 0);
  assert.equal(report.summary.customerDebtCount, 0);
});

test('AR customer debt read model ignores inactive/unconfirmed ledgers and keeps reversal as debit category', () => {
  const rows = [
    ...b0038424Fixture(),
    baseLedger({
      _id: 'voided-return',
      id: 'AR-RETURN-VOIDED',
      code: 'AR-RETURN-VOIDED',
      category: 'AR-RETURN',
      status: 'voided',
      credit: 999999,
      amount: 999999,
      direction: 'credit'
    }),
    baseLedger({
      _id: 'unconfirmed-return',
      id: 'AR-RETURN-UNCONFIRMED',
      code: 'AR-RETURN-UNCONFIRMED',
      category: 'AR-RETURN',
      accountingConfirmed: false,
      credit: 999999,
      amount: 999999,
      direction: 'credit'
    }),
    baseLedger({
      _id: 'return-reversal',
      id: 'AR-RETURN-REVERSAL-RO-B0038424',
      code: 'AR-RETURN-REVERSAL-RO-B0038424',
      category: 'AR-RETURN-REVERSAL',
      ledgerType: 'AR-RETURN-REVERSAL',
      type: 'ar_return_reversal',
      debit: 5000,
      amount: 5000,
      direction: 'debit'
    })
  ];
  const report = buildCustomerDebtReadModelFromLedgers(rows, { status: 'all', q: '4501256' }, { today: '2026-06-29' });
  const order = report.orders[0];

  assert.equal(normalizeArCategory({ category: 'AR-RETURN-REVERSAL' }), 'AR-RETURN-REVERSAL');
  assert.equal(canonicalOrderKey({ returnOrderId: 'RO-B0038424' }), 'B0038424');
  assert.equal(order.returnAmount, 276632);
  assert.equal(order.returnReversalAmount, 5000);
  assert.equal(order.totalDebit, 5146521);
  assert.equal(order.totalCredit, 5140632);
  assert.equal(order.remainingDebt, 5889);
  assert.equal(order.remainingDebtDisplay, 5889);
  assert.equal(order.ledgerIds.includes('voided-return'), false);
  assert.equal(order.ledgerIds.includes('unconfirmed-return'), false);
});

test('AR customer debt read model status filters separate open, settled tolerance and overpaid customers', () => {
  const rows = [
    baseLedger({
      _id: 'cust-a-sale',
      id: 'AR-SALE-A001',
      code: 'AR-SALE-A001',
      category: 'AR-SALE',
      customerCode: 'A001',
      customerName: 'Customer A',
      orderId: 'SO-A001',
      orderCode: 'A001-ORDER',
      salesOrderId: 'SO-A001',
      salesOrderCode: 'A001-ORDER',
      debit: 1000000,
      amount: 1000000,
      direction: 'debit'
    }),
    baseLedger({
      _id: 'cust-a-receipt',
      id: 'AR-RECEIPT-A001',
      code: 'AR-RECEIPT-A001',
      category: 'AR-RECEIPT',
      customerCode: 'A001',
      customerName: 'Customer A',
      orderId: 'SO-A001',
      orderCode: 'A001-ORDER',
      salesOrderId: 'SO-A001',
      salesOrderCode: 'A001-ORDER',
      credit: 300000,
      amount: 300000,
      direction: 'credit'
    }),
    ...b0038424Fixture(),
    baseLedger({
      _id: 'cust-c-sale',
      id: 'AR-SALE-C001',
      code: 'AR-SALE-C001',
      category: 'AR-SALE',
      customerCode: 'C001',
      customerName: 'Customer C',
      orderId: 'SO-C001',
      orderCode: 'C001-ORDER',
      salesOrderId: 'SO-C001',
      salesOrderCode: 'C001-ORDER',
      debit: 1000000,
      amount: 1000000,
      direction: 'debit'
    }),
    baseLedger({
      _id: 'cust-c-receipt',
      id: 'AR-RECEIPT-C001',
      code: 'AR-RECEIPT-C001',
      category: 'AR-RECEIPT',
      customerCode: 'C001',
      customerName: 'Customer C',
      orderId: 'SO-C001',
      orderCode: 'C001-ORDER',
      salesOrderId: 'SO-C001',
      salesOrderCode: 'C001-ORDER',
      credit: 1200000,
      amount: 1200000,
      direction: 'credit'
    })
  ];

  const openReport = buildCustomerDebtReadModelFromLedgers(rows, { status: '', delivery: 'ghth' }, { today: '2026-06-29' });
  assert.deepEqual(openReport.customers.map((customer) => customer.customerCode), ['A001']);
  assert.equal(openReport.customers[0].debt, 700000);
  assert.equal(openReport.orders.length, 1);

  const paidReport = buildCustomerDebtReadModelFromLedgers(rows, { status: 'paid', delivery: 'ghth' }, { today: '2026-06-29' });
  assert.deepEqual(paidReport.customers.map((customer) => customer.customerCode), ['4501256']);
  assert.equal(paidReport.customers[0].debt, 0);
  assert.equal(paidReport.customers[0].rawDebt, 889);

  const overpaidReport = buildCustomerDebtReadModelFromLedgers(rows, { status: 'overpaid', delivery: 'ghth' }, { today: '2026-06-29' });
  assert.deepEqual(overpaidReport.customers.map((customer) => customer.customerCode), ['C001']);
  assert.equal(overpaidReport.customers[0].debt, -200000);

  const allReport = buildCustomerDebtReadModelFromLedgers(rows, { status: 'all', delivery: 'ghth' }, { today: '2026-06-29' });
  assert.deepEqual(new Set(allReport.customers.map((customer) => customer.customerCode)), new Set(['A001', '4501256', 'C001']));
});
