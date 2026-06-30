'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildCustomerDebtReadModelFromLedgers,
  canonicalOrderKey,
  normalizeArCategory
} = require('../src/services/accounting/arCustomerDebtReadModel.service');

function baseLedger(overrides = {}) {
  const category = overrides.category || 'AR-DEBT-OPEN';
  const orderId = overrides.orderId || overrides.salesOrderId || 'SO178255038016695';
  const orderCode = overrides.orderCode || overrides.salesOrderCode || 'B0038424';
  const sourceId = overrides.sourceId || overrides.salesOrderId || overrides.orderId || orderId;
  const sourceCode = overrides.sourceCode || overrides.salesOrderCode || overrides.orderCode || orderCode;
  const debit = Number(overrides.debit || 0);
  const credit = Number(overrides.credit || 0);
  const direction = overrides.direction || (debit > 0 ? 'debit' : credit > 0 ? 'credit' : '');
  const sourceType = overrides.sourceType || (category === 'AR-DEBT-OPEN'
    ? 'SALES_ORDER_DELIVERY_CLOSEOUT'
    : category === 'AR-DEBT-PAYMENT'
      ? 'CUSTOMER_DEBT_PAYMENT'
      : 'DELIVERY_CLOSEOUT_CORRECTION');
  const idempotencyKey = overrides.idempotencyKey || (category === 'AR-DEBT-OPEN'
    ? `AR-DEBT-OPEN:${sourceId}`
    : `${category}:${sourceId}:${sourceCode}`);
  return {
    account: 'AR',
    category,
    ledgerType: category,
    entryType: 'normal',
    sourceType,
    sourceId,
    sourceCode,
    idempotencyKey,
    accountingBatchId: category === 'AR-DEBT-OPEN' ? `ACC-${sourceId}-TEST` : `BATCH-${sourceId}-TEST`,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    status: 'posted',
    tenantId: '',
    customerCode: '4501256',
    customerId: '6a257c883527e67aa4a8cc74',
    customerName: 'Chị Sen',
    date: '2026-06-29',
    orderId,
    orderCode,
    salesOrderId: orderId,
    salesOrderCode: orderCode,
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'Thành GH Tiền hải',
    salesStaffCode: '35095',
    salesStaffName: 'Nguyễn Đình Thành',
    debit,
    credit,
    amount: Number(overrides.amount !== undefined ? overrides.amount : Math.max(debit, credit)),
    direction,
    amountField: overrides.amountField || direction,
    ...overrides
  };
}

function b0038424Fixture() {
  return [
    baseLedger({
      _id: 'sale-ledger',
      id: 'AR-DEBT-OPEN-B0038424',
      code: 'AR-DEBT-OPEN-B0038424',
      debit: 5141521
    }),
    baseLedger({
      _id: 'receipt-ledger',
      id: 'AR-DEBT-PAYMENT-B0038424',
      code: 'AR-DEBT-PAYMENT-B0038424',
      category: 'AR-DEBT-PAYMENT',
      ledgerType: 'AR-DEBT-PAYMENT',
      credit: 4864000
    }),
    baseLedger({
      _id: 'return-adjustment-ledger',
      id: 'AR-DEBT-ADJUSTMENT-RO-B0038424',
      code: 'AR-DEBT-ADJUSTMENT-RO-B0038424',
      category: 'AR-DEBT-ADJUSTMENT',
      ledgerType: 'AR-DEBT-ADJUSTMENT',
      sourceId: 'RO-B0038424',
      sourceCode: 'RO-B0038424',
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
      idempotencyKey: 'AR-DEBT-ADJUSTMENT:SO178255038016695:V2',
      credit: 276632,
      returnOrderId: 'RO-B0038424',
      returnOrderCode: 'RO-B0038424'
    })
  ];
}

test('AR customer debt read model groups AR-DEBT adjustment into B0038424 and applies tolerance', () => {
  const report = buildCustomerDebtReadModelFromLedgers(b0038424Fixture(), { status: 'all', q: '4501256' }, { today: '2026-06-29' });

  assert.equal(report.debugSource.source, 'arLedgers');
  assert.equal(report.debugSource.usesSnapshot, false);
  assert.equal(report.orders.length, 1);

  const order = report.orders[0];
  assert.equal(order.orderKey, 'SO178255038016695');
  assert.equal(order.orderCode, 'B0038424');
  assert.equal(order.arSaleAmount, 5141521);
  assert.equal(order.receiptAmount, 4864000);
  assert.equal(order.returnAmount, 0);
  assert.equal(order.adjustmentCreditAmount, 276632);
  assert.equal(order.totalDebit, 5141521);
  assert.equal(order.totalCredit, 5140632);
  assert.equal(order.remainingDebt, 889);
  assert.equal(order.remainingDebtDisplay, 0);
  assert.equal(order.debt, 0);
  assert.equal(order.debtStatus, 'settled_by_tolerance');
  assert.deepEqual(order.ledgerIds, ['sale-ledger', 'receipt-ledger', 'return-adjustment-ledger']);

  const customer = report.customers[0];
  assert.equal(customer.customerCode, '4501256');
  assert.equal(customer.debt, 0);
  assert.equal(customer.rawDebt, 889);
  assert.equal(customer.orders[0].adjustmentCreditAmount, 276632);
});

test('AR customer debt read model excludes settled tolerance rows from Khách còn nợ', () => {
  const report = buildCustomerDebtReadModelFromLedgers(b0038424Fixture(), { status: '', q: '4501256' }, { today: '2026-06-29' });
  assert.equal(report.orders.length, 0);
  assert.equal(report.customers.length, 0);
  assert.equal(report.summary.orderDebtCount, 0);
  assert.equal(report.summary.customerDebtCount, 0);
});

test('AR customer debt read model ignores inactive/unconfirmed ledgers and keeps debit adjustment category', () => {
  const rows = [
    ...b0038424Fixture(),
    baseLedger({
      _id: 'voided-adjustment',
      id: 'AR-DEBT-ADJUSTMENT-VOIDED',
      code: 'AR-DEBT-ADJUSTMENT-VOIDED',
      category: 'AR-DEBT-ADJUSTMENT',
      ledgerType: 'AR-DEBT-ADJUSTMENT',
      status: 'voided',
      active: false,
      credit: 999999
    }),
    baseLedger({
      _id: 'unconfirmed-adjustment',
      id: 'AR-DEBT-ADJUSTMENT-UNCONFIRMED',
      code: 'AR-DEBT-ADJUSTMENT-UNCONFIRMED',
      category: 'AR-DEBT-ADJUSTMENT',
      ledgerType: 'AR-DEBT-ADJUSTMENT',
      accountingConfirmed: false,
      credit: 999999
    }),
    baseLedger({
      _id: 'debit-adjustment',
      id: 'AR-DEBT-ADJUSTMENT-DEBIT-B0038424',
      code: 'AR-DEBT-ADJUSTMENT-DEBIT-B0038424',
      category: 'AR-DEBT-ADJUSTMENT',
      ledgerType: 'AR-DEBT-ADJUSTMENT',
      debit: 5000
    })
  ];
  const report = buildCustomerDebtReadModelFromLedgers(rows, { status: 'all', q: '4501256' }, { today: '2026-06-29' });
  const order = report.orders[0];

  assert.equal(normalizeArCategory({ category: 'AR-DEBT-ADJUSTMENT' }), 'AR-DEBT-ADJUSTMENT');
  assert.equal(canonicalOrderKey({ returnOrderId: 'RO-B0038424' }), 'B0038424');
  assert.equal(order.returnAmount, 0);
  assert.equal(order.adjustmentCreditAmount, 276632);
  assert.equal(order.adjustmentDebitAmount, 5000);
  assert.equal(order.totalDebit, 5146521);
  assert.equal(order.totalCredit, 5140632);
  assert.equal(order.remainingDebt, 5889);
  assert.equal(order.remainingDebtDisplay, 5889);
  assert.equal(order.ledgerIds.includes('voided-adjustment'), false);
  assert.equal(order.ledgerIds.includes('unconfirmed-adjustment'), false);
});

test('AR customer debt read model status filters separate open, settled tolerance and overpaid customers', () => {
  const rows = [
    baseLedger({
      _id: 'cust-a-sale',
      id: 'AR-DEBT-OPEN-A001',
      code: 'AR-DEBT-OPEN-A001',
      customerCode: 'A001',
      customerName: 'Customer A',
      orderId: 'SO-A001',
      orderCode: 'A001-ORDER',
      salesOrderId: 'SO-A001',
      salesOrderCode: 'A001-ORDER',
      debit: 1000000
    }),
    baseLedger({
      _id: 'cust-a-receipt',
      id: 'AR-DEBT-PAYMENT-A001',
      code: 'AR-DEBT-PAYMENT-A001',
      category: 'AR-DEBT-PAYMENT',
      ledgerType: 'AR-DEBT-PAYMENT',
      customerCode: 'A001',
      customerName: 'Customer A',
      orderId: 'SO-A001',
      orderCode: 'A001-ORDER',
      salesOrderId: 'SO-A001',
      salesOrderCode: 'A001-ORDER',
      credit: 300000
    }),
    ...b0038424Fixture(),
    baseLedger({
      _id: 'cust-c-sale',
      id: 'AR-DEBT-OPEN-C001',
      code: 'AR-DEBT-OPEN-C001',
      customerCode: 'C001',
      customerName: 'Customer C',
      orderId: 'SO-C001',
      orderCode: 'C001-ORDER',
      salesOrderId: 'SO-C001',
      salesOrderCode: 'C001-ORDER',
      debit: 1000000
    }),
    baseLedger({
      _id: 'cust-c-receipt',
      id: 'AR-DEBT-PAYMENT-C001',
      code: 'AR-DEBT-PAYMENT-C001',
      category: 'AR-DEBT-PAYMENT',
      ledgerType: 'AR-DEBT-PAYMENT',
      customerCode: 'C001',
      customerName: 'Customer C',
      orderId: 'SO-C001',
      orderCode: 'C001-ORDER',
      salesOrderId: 'SO-C001',
      salesOrderCode: 'C001-ORDER',
      credit: 1200000
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
