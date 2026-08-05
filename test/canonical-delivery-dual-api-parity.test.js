'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const resolver = require('../src/services/delivery/DeliveryPaymentStateReadService');
const webService = require('../src/services/v2/deliveryTodayNew.service');
const { buildCanonicalOrder } = require('../src/engines/delivery.legacy.engine');
const b0040961 = require('./fixtures/canonical-delivery-financial/b0040961-equivalent');

const ROOT = path.resolve(__dirname, '..');
const PARITY_FIELDS = [
  'receivableAmount',
  'cashAmount',
  'bankAmount',
  'rewardAmount',
  'offsetAmount',
  'totalCollectedAmount',
  'returnAmount',
  'debtRaw',
  'debtAmount',
  'paymentVersion',
  'paymentStateSource',
  'returnStateSource'
];

function chain(rows) {
  return {
    select() { return this; },
    sort() { return this; },
    session() { return this; },
    async lean() { return rows; }
  };
}

function model(rows) {
  return { find() { return chain(rows); } };
}

function order(overrides = {}) {
  return {
    id: 'SO-1',
    _id: 'SO-1',
    orderId: 'SO-1',
    salesOrderId: 'SO-1',
    code: 'B0001',
    orderCode: 'B0001',
    salesOrderCode: 'B0001',
    tenantId: 'TENANT-A',
    customerCode: 'C-1',
    customerName: 'Fixture customer',
    deliveryStatus: 'delivered',
    status: 'delivered',
    totalAmount: 10000,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    items: [{ productCode: 'SKU-1', productName: 'SKU 1', quantity: 1, salePrice: 10000 }],
    ...overrides
  };
}

function version(overrides = {}) {
  return {
    id: 'V-1',
    orderId: 'SO-1',
    orderCode: 'B0001',
    salesOrderId: 'SO-1',
    salesOrderCode: 'B0001',
    tenantId: 'TENANT-A',
    closeoutVersion: 1,
    status: 'accounting_confirmed',
    originalAmount: 10000,
    cashAmount: 1000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    ...overrides
  };
}

function allocation(overrides = {}) {
  return {
    id: 'OPA-1',
    allocationCode: 'OPA-1',
    orderId: 'SO-1',
    orderCode: 'B0001',
    salesOrderId: 'SO-1',
    salesOrderCode: 'B0001',
    tenantId: 'TENANT-A',
    sourceVersion: 1,
    status: 'posted',
    active: true,
    receivableAmount: 10000,
    cashAmount: 2000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    ...overrides
  };
}

function returnOrder(overrides = {}) {
  return {
    id: 'RO-1',
    code: 'RO-1',
    orderId: 'SO-1',
    orderCode: 'B0001',
    salesOrderId: 'SO-1',
    salesOrderCode: 'B0001',
    tenantId: 'TENANT-A',
    status: 'waiting_receive',
    returnAmount: 3000,
    ...overrides
  };
}

function webReturnsMap(currentOrder, returns) {
  const normalized = returns.map((row) => ({
    ...row,
    amount: resolver._private.ReturnStateReader.returnOrderAmount(row, []),
    totalAmount: resolver._private.ReturnStateReader.returnOrderAmount(row, []),
    orderId: String(row.orderId || row.salesOrderId || ''),
    orderCode: String(row.orderCode || row.salesOrderCode || ''),
    id: String(row.id || row._id || row.code || ''),
    code: String(row.code || row.id || row._id || '')
  }));
  const map = new Map();
  for (const key of resolver.orderBusinessIds(currentOrder)) map.set(key, normalized);
  return map;
}

function pick(row) {
  const financial = row.financial || row;
  return Object.fromEntries(PARITY_FIELDS.map((field) => {
    if (financial[field] !== undefined) return [field, financial[field]];
    return [field, row[field]];
  }));
}

async function runScenario({ currentOrder, versions = [], allocations = [], returns = [] }) {
  const result = await resolver.resolvePaymentStatesForOrders([currentOrder], {
    models: {
      DeliveryCloseoutVersion: model(versions),
      OrderPaymentAllocation: model(allocations),
      ReturnOrder: model(returns)
    },
    includeReturnState: true
  });
  const state = result.states[0];
  const web = webService.summarizeOrder(
    currentOrder,
    webReturnsMap(currentOrder, returns),
    result.versionsByKey,
    result.allocationsByKey,
    state
  );
  const app = buildCanonicalOrder(currentOrder, returns, state);
  return { state, web, app };
}

async function assertParity(title, scenario, expected = {}) {
  const { state, web, app } = await runScenario(scenario);
  assert.deepStrictEqual(pick(web), pick(app), title);
  assert.deepStrictEqual(pick(web), pick(state), `${title}: both projections must equal shared resolver state`);
  for (const [field, value] of Object.entries(expected)) assert.equal(pick(web)[field], value, `${title}: ${field}`);
  assert.equal(web.financialContractVersion, 'delivery-financial-v1');
  assert.equal(app.financialContractVersion, 'delivery-financial-v1');
}

test('API-001 GREEN: B0040961-equivalent Web/App use the same canonical financial state', async () => {
  const currentOrder = { ...b0040961.order, tenantId: 'TENANT-A' };
  const versions = [{ ...b0040961.closeoutVersion, tenantId: 'TENANT-A' }];
  const allocations = [{ ...b0040961.allocation, tenantId: 'TENANT-A' }];
  const returns = [{
    id: 'RO-B0040961',
    code: 'RO-B0040961',
    orderId: currentOrder.id,
    orderCode: currentOrder.orderCode,
    tenantId: 'TENANT-A',
    status: 'waiting_receive',
    returnAmount: 1931784,
    items: b0040961.returnItems
  }];
  await assertParity('B0040961', { currentOrder, versions, allocations, returns }, {
    cashAmount: 1932000,
    returnAmount: 1931784,
    debtRaw: -1932000,
    debtAmount: -1932000,
    paymentStateSource: 'orderPaymentAllocations.current',
    returnStateSource: 'returnOrders'
  });
});

test('API-002 GREEN: payment-only parity', async () => {
  await assertParity('payment-only', {
    currentOrder: order(),
    versions: [version()],
    allocations: [allocation({ cashAmount: 4000 })]
  }, { cashAmount: 4000, returnAmount: 0, debtAmount: 6000 });
});

test('API-003 GREEN: return-only parity', async () => {
  await assertParity('return-only', {
    currentOrder: order(),
    returns: [returnOrder({ returnAmount: 3000 })]
  }, { cashAmount: 0, returnAmount: 3000, debtAmount: 7000 });
});

test('API-004 GREEN: payment plus return parity', async () => {
  await assertParity('combined', {
    currentOrder: order(),
    versions: [version()],
    allocations: [allocation({ cashAmount: 2500 })],
    returns: [returnOrder({ returnAmount: 3500 })]
  }, { totalCollectedAmount: 2500, returnAmount: 3500, debtAmount: 4000 });
});

test('API-005 GREEN: unclosed embedded legacy fallback parity', async () => {
  await assertParity('unclosed', {
    currentOrder: order({ deliveryCloseout: { originalAmount: 10000, cashAmount: 1000, bankAmount: 500, rewardAmount: 0, offsetAmount: 0 } })
  }, { paymentStateSource: 'salesOrders.deliveryCloseout', cashAmount: 1000, bankAmount: 500, debtAmount: 8500 });
});

test('API-006 GREEN: closed current allocation parity', async () => {
  await assertParity('closed-current', {
    currentOrder: order(),
    versions: [version()],
    allocations: [allocation({ cashAmount: 6500 })]
  }, { paymentVersion: 1, cashAmount: 6500, debtAmount: 3500 });
});

test('API-007 GREEN: stale allocation yields latest version parity', async () => {
  await assertParity('stale', {
    currentOrder: order(),
    versions: [version({ closeoutVersion: 2, cashAmount: 3000 })],
    allocations: [allocation({ sourceVersion: 1, cashAmount: 9000 })]
  }, { paymentStateSource: 'deliveryCloseoutVersions.latest', cashAmount: 3000, debtAmount: 7000 });
});

test('API-008 GREEN: no allocation/version uses top-level legacy parity', async () => {
  await assertParity('top-level-legacy', {
    currentOrder: order({ cashAmount: 1500, bankAmount: 500 })
  }, { paymentStateSource: 'orders.top-level', totalCollectedAmount: 2000, debtAmount: 8000 });
});

test('API-009 GREEN: explicit all-zero legacy fields remain zero', async () => {
  await assertParity('legacy-zero', {
    currentOrder: order({ cashAmount: 0, cashCollected: 9999, bankAmount: 0, rewardAmount: 0 })
  }, { cashAmount: 0, debtAmount: 10000 });
});

test('API-010 GREEN: overpayment stays signed in both projections', async () => {
  await assertParity('overpayment', {
    currentOrder: order(),
    versions: [version()],
    allocations: [allocation({ cashAmount: 12000 })]
  }, { debtRaw: -2000, debtAmount: -2000 });
});

test('API-011 GREEN: unknown return state warning does not break parity', async () => {
  await assertParity('unknown-return', {
    currentOrder: order(),
    returns: [returnOrder({ status: 'legacy_custom_state', returnAmount: 2000 })]
  }, { returnAmount: 2000, debtAmount: 8000 });
});

test('API-012 GREEN: compatibility aliases equal canonical fields', async () => {
  const { web, app } = await runScenario({
    currentOrder: order(),
    versions: [version()],
    allocations: [allocation({ cashAmount: 1000, bankAmount: 2000, rewardAmount: 300, offsetAmount: 200 })],
    returns: [returnOrder({ returnAmount: 500 })]
  });
  for (const row of [web, app]) {
    assert.equal(row.cashAmount, row.financial.cashAmount);
    assert.equal(row.cashCollected, row.financial.cashAmount);
    assert.equal(row.bankAmount, row.financial.bankAmount);
    assert.equal(row.transferAmount, row.financial.bankAmount);
    assert.equal(row.returnAmount, row.financial.returnAmount);
    assert.equal(row.returnedAmount, row.financial.returnAmount);
    assert.equal(row.debtAmount, row.financial.debtAmount);
    assert.equal(row.remainingAmount, row.financial.openDebtAmount);
  }
});

test('API wiring: both list paths call the shared batch resolver with canonical return state enabled', () => {
  const webSource = fs.readFileSync(path.join(ROOT, 'src/services/v2/deliveryTodayNew.service.js'), 'utf8');
  const engineSource = [
    'src/engines/delivery.legacy.engine.source/part-01.jsfrag',
    'src/engines/delivery.legacy.engine.source/part-02.jsfrag',
    'src/engines/delivery.legacy.engine.source/part-03.jsfrag'
  ].map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('');
  assert.match(webSource, /resolvePaymentStatesForOrders\(orders,[\s\S]*?includeReturnState:\s*true/);
  assert.match(engineSource, /async listOrders\(query = \{\}\)[\s\S]*?resolvePaymentStatesForOrders\(orders,[\s\S]*?includeReturnState:\s*true/);
  assert.match(engineSource, /DeliveryPaymentStateReadService[\s\S]*?\.returnRowsForOrder\(order, financialResult\.returnResult\)/);
  const listBody = engineSource.match(/async listOrders\(query = \{\}\) \{([\s\S]*?)\n  \}\n\n  normalizeReturnItems/);
  assert.ok(listBody, 'engine listOrders body must be inspectable');
  const canonicalBranch = listBody[1].slice(listBody[1].indexOf('} else {'));
  assert.doesNotMatch(canonicalBranch, /findReturnOrdersFor\(/, 'canonical/shadow app list must reuse resolver returnOrders query');
  assert.doesNotMatch(canonicalBranch, /_private\.ReturnStateReader/, 'integration must use the public resolver facade');
});
