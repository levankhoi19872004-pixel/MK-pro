'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Audit = require('../scripts/audit-closeout-ar-splitbrain');
const DeliveryPaymentStateReadService = require('../src/services/delivery/DeliveryPaymentStateReadService');

function fakeQuery(rows) {
  return {
    select() { return this; },
    sort() { return this; },
    session() { return this; },
    lean() { return Promise.resolve(rows.map((row) => ({ ...row }))); }
  };
}
function fakeModel(rows) {
  return { find() { return fakeQuery(rows); } };
}

async function productionShapedSnapshot({ returnRows = [] } = {}) {
  const order = {
    id: 'SO-RETURN-001', orderId: 'SO-RETURN-001', salesOrderId: 'SO-RETURN-001',
    code: 'RETURN-001', orderCode: 'RETURN-001', salesOrderCode: 'RETURN-001',
    customerCode: 'C-RETURN-001', customerName: 'Return Fixture',
    receivableAmount: 10000,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 0,
    accountingConfirmed: true
  };
  const result = await DeliveryPaymentStateReadService.resolvePaymentStatesForOrders([order], {
    includeReturnState: true,
    models: {
      DeliveryCloseoutVersion: fakeModel([]),
      OrderPaymentAllocation: fakeModel([]),
      ReturnOrder: fakeModel(returnRows)
    }
  });
  const state = result.states[0];
  return {
    order,
    snapshot: {
      ok: true,
      state,
      debtRaw: state.debtRaw,
      returnRows: DeliveryPaymentStateReadService.returnRowsForOrder(order, result.returnResult),
      returnState: DeliveryPaymentStateReadService._private.ReturnStateReader.returnStateForOrder(order, result.returnStatesByIdentity),
      allocationRef: '',
      closeoutVersionRef: ''
    }
  };
}

function correctionFor(order) {
  return {
    id: 'DCOC-RETURN-001', correctionId: 'DCOC-RETURN-001', correctionCode: 'DCOC-RETURN-001',
    orderId: order.id, salesOrderId: order.id, orderCode: order.code, salesOrderCode: order.code,
    customerCode: order.customerCode,
    receivableDelta: 0, cashDelta: 0, bankDelta: 0, rewardDelta: 0, returnDelta: 0
  };
}

function ledgerRows(order) {
  return [
    {
      id: 'AR-DEBT-OPEN-RETURN-001', account: 'AR', category: 'AR-DEBT-OPEN', ledgerType: 'AR-DEBT-OPEN',
      sourceType: 'SALES_ORDER_DELIVERY_CLOSEOUT', sourceId: order.id, sourceCode: order.code, entryType: 'normal', idempotencyKey: `AR-DEBT-OPEN:${order.id}`, accountingConfirmed: true, accountingStatus: 'confirmed', active: true, orderId: order.id, orderCode: order.code, salesOrderId: order.id, salesOrderCode: order.code,
      customerCode: order.customerCode, debit: 10000, credit: 0, amount: 10000, direction: 'debit', amountField: 'debit', status: 'posted'
    },
    {
      id: 'AR-RETURN-RO-RETURN-001', account: 'AR', category: 'AR-RETURN', ledgerType: 'AR-RETURN',
      sourceType: 'RETURN_ORDER', refType: 'RETURN_ORDER', sourceModel: 'returnOrders', entryType: 'normal', accountingConfirmed: true, active: true,
      returnOrderId: 'RO-RETURN-001', returnOrderCode: 'RO-RETURN-001', refId: 'RO-RETURN-001', sourceId: 'RO-RETURN-001',
      orderId: order.id, orderCode: order.code, salesOrderId: order.id, salesOrderCode: order.code,
      customerCode: order.customerCode, debit: 0, credit: 2000, amount: 2000, direction: 'credit', amountField: 'credit', status: 'posted', accountingStatus: 'confirmed', sourceCode: 'RO-RETURN-001',
      idempotencyKey: 'AR-RETURN:RO-RETURN-001'
    }
  ];
}

test('R1P3 RED: healthy posted return already inside canonical delivery snapshot must not be subtracted again', async () => {
  const returnOrder = {
    id: 'RO-RETURN-001', code: 'RO-RETURN-001', sourceModel: 'returnOrders',
    salesOrderId: 'SO-RETURN-001', salesOrderCode: 'RETURN-001',
    customerCode: 'C-RETURN-001', customerId: 'C-RETURN-001',
    status: 'posted_to_ar', returnState: 'posted_to_ar', accountingStatus: 'accounting_confirmed',
    accountingConfirmed: true, arPosted: true, returnAmount: 2000, amount: 2000
  };
  const { order, snapshot } = await productionShapedSnapshot({ returnRows: [returnOrder] });
  assert.equal(snapshot.state.returnAmount, 2000);
  assert.equal(snapshot.debtRaw, 8000, 'canonical delivery resolver must derive 10,000 - 2,000 return = 8,000');

  const rawLedgers = ledgerRows(order);
  const canonical = Audit.canonicalRowsFromFixture(rawLedgers);
  const result = Audit.classifyTimeline({
    correction: correctionFor(order),
    canonicalOrderRows: canonical,
    allArRows: rawLedgers,
    snapshot
  });

  assert.equal(result.canonicalArDebt, 8000);
  assert.equal(result.expectedArFromEventTimeline, 8000, 'AR-RETURN already represented in snapshot must not be applied twice');
  assert.equal(result.classification, 'no_mismatch');
});
