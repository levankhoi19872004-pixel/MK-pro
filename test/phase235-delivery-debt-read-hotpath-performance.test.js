'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const deliveryTodayNewService = require('../src/services/v2/deliveryTodayNew.service');
const debtNewService = require('../src/services/v2/debtNew.service');

class FakeQuery {
  constructor(rows, tracker, name) {
    this.rows = rows;
    this.tracker = tracker;
    this.name = name;
    this.limitValue = null;
  }

  sort(value) {
    this.tracker.sorts.push({ name: this.name, value });
    return this;
  }

  limit(value) {
    this.limitValue = value;
    this.tracker.limits.push({ name: this.name, value });
    return this;
  }

  select(value) {
    this.tracker.selects.push({ name: this.name, value });
    return this;
  }

  session() {
    return this;
  }

  lean() {
    return this;
  }

  then(resolve, reject) {
    const rows = this.limitValue ? this.rows.slice(0, this.limitValue) : this.rows;
    this.tracker.rowsReturned[this.name] = (this.tracker.rowsReturned[this.name] || 0) + rows.length;
    return Promise.resolve(rows).then(resolve, reject);
  }
}

function tracker() {
  return { counts: {}, filters: {}, limits: [], selects: [], sorts: [], rowsReturned: {} };
}

function model(name, rows, state) {
  return {
    find(filter) {
      state.counts[name] = (state.counts[name] || 0) + 1;
      state.filters[name] = filter;
      return new FakeQuery(rows, state, name);
    }
  };
}

function salesOrderRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `SO-${index}`,
    code: `B${String(index).padStart(5, '0')}`,
    salesOrderCode: `B${String(index).padStart(5, '0')}`,
    customerCode: `C${String(index).padStart(4, '0')}`,
    customerName: `Customer ${index}`,
    deliveryDate: '2026-07-11',
    deliveryDateKey: '2026-07-11',
    deliveryStaffCode: 'GH1',
    salesStaffCode: 'NV1',
    totalAmount: 100000 + index,
    cashAmount: 10000,
    bankAmount: 5000,
    accountingConfirmed: true,
    accountingStatus: 'confirmed'
  }));
}

function arLedgerRows(count) {
  return Array.from({ length: count }, (_, index) => {
    const orderId = `SO-${index}`;
    const orderCode = `B${String(index).padStart(5, '0')}`;
    return {
      id: `AR-${index}`,
      code: `AR-${index}`,
      account: 'AR',
      category: 'AR-DEBT-OPEN',
      ledgerType: 'AR-DEBT-OPEN',
      entryType: 'normal',
      sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT',
      sourceId: orderId,
      sourceCode: orderCode,
      orderId,
      orderCode,
      salesOrderId: orderId,
      salesOrderCode: orderCode,
      customerCode: 'C1',
      customerName: 'Customer 1',
      salesStaffCode: 'NV1',
      deliveryStaffCode: 'GH1',
      debit: 100000 + index,
      credit: 0,
      amount: 100000 + index,
      direction: 'debit',
      amountField: 'debit',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      active: true,
      reversed: false,
      deleted: false,
      isDeleted: false,
      status: 'posted',
      idempotencyKey: `AR-DEBT-OPEN:${orderId}`,
      date: '2026-07-11'
    };
  });
}

test('Phase235 Delivery Today keeps fixed query count and hot-path projections', async () => {
  const state = tracker();
  deliveryTodayNewService.setModelsForTest({
    SalesOrder: model('SalesOrder', salesOrderRows(600), state),
    MasterOrder: model('MasterOrder', [], state),
    ReturnOrder: model('ReturnOrder', [], state),
    DeliveryCloseoutVersion: model('DeliveryCloseoutVersion', [], state),
    OrderPaymentAllocation: model('OrderPaymentAllocation', [], state)
  });

  try {
    const result = await deliveryTodayNewService.listOrders({
      date: '2026-07-11',
      deliveryDateChangedByUser: '1',
      delivery: 'GH1',
      limit: 500
    });

    assert.deepEqual(state.counts, {
      SalesOrder: 1,
      MasterOrder: 1,
      ReturnOrder: 1,
      DeliveryCloseoutVersion: 1,
      OrderPaymentAllocation: 1
    });
    assert.equal(result.rows.length, 500);
    assert.equal(result.diagnostics.performance.queryCount, 5);
    assert.equal(result.diagnostics.performance.fixedQueryCount, true);
    assert.deepEqual(state.selects.map((item) => item.name), [
      'SalesOrder',
      'MasterOrder',
      'ReturnOrder',
      'DeliveryCloseoutVersion',
      'OrderPaymentAllocation'
    ]);
  } finally {
    deliveryTodayNewService.setModelsForTest(null);
  }
});

test('Phase235 Debt New applies ArLedger limit and projections before grouping', async () => {
  const state = tracker();
  debtNewService.setModelsForTest({
    ArLedger: model('ArLedger', arLedgerRows(2000), state),
    OrderPaymentAllocation: model('OrderPaymentAllocation', [], state),
    DebtCollection: model('DebtCollection', [], state)
  });

  try {
    const result = await debtNewService.listCustomers({
      customerCode: 'C1',
      status: 'all',
      limit: 500
    });

    assert.equal(state.counts.ArLedger, 1);
    assert.equal(state.counts.OrderPaymentAllocation, 1);
    assert.equal(state.counts.DebtCollection, 1);
    assert.deepEqual(state.limits.map((item) => [item.name, item.value]), [
      ['ArLedger', 500],
      ['OrderPaymentAllocation', 5000],
      ['DebtCollection', 5000]
    ]);
    assert.equal(state.rowsReturned.ArLedger, 500);
    assert.equal(result.ledgers.length, 500);
    assert.equal(result.diagnostics.performance.queryCount, 3);
    assert.equal(result.diagnostics.performance.boundedLedgerRead, true);
    assert.deepEqual(state.selects.map((item) => item.name), [
      'ArLedger',
      'OrderPaymentAllocation',
      'DebtCollection'
    ]);
  } finally {
    debtNewService.setModelsForTest(null);
  }
});
