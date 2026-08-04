'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  calculateCorrectionDebtDelta,
  assertCorrectionDebtDeltaPolicy
} = require('../src/domain/accounting/correctionDebtDelta');

const ROOT = path.resolve(__dirname, '..');
const UI_FILE = path.join(ROOT, 'public/js/app/new/91-delivery-today-new.js');

function createUiHarness({ row, returnRows, correctedCash = '0' }) {
  const elements = new Map([
    ['deliveryAdjustmentReason', { value: '' }],
    ['deliveryAdjustmentNote', { value: 'Phase A1 reproduction' }],
    ['deliveryAdjustCashNew', { value: correctedCash }],
    ['deliveryAdjustBankNew', { value: '0' }],
    ['deliveryAdjustRewardNew', { value: '0' }]
  ]);

  const qtyInputs = returnRows.map((item) => ({ value: String(item.newReturnQty) }));
  const captured = { requests: [] };

  const document = {
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) {
      const match = selector.match(/deliveryNewReturnQtyInput\[data-index="(\d+)"\]/);
      if (match) return qtyInputs[Number(match[1])] || null;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  const window = {
    addEventListener() {},
    location: { hash: '', pathname: '/', search: '' },
    console: { debug() {}, warn() {}, error() {}, log() {} }
  };

  const fetch = async (url, options = {}) => {
    captured.requests.push({ url, options, body: JSON.parse(options.body || '{}') });
    return {
      ok: false,
      async json() { return { message: 'A1_CAPTURE_ONLY' }; }
    };
  };

  let source = fs.readFileSync(UI_FILE, 'utf8');
  source = source.replace(
    '  window.loadDeliveryTodayNew = load;',
    '  window.__phaseA1DeliveryHooks = { state: state, totalsFromPopup: totalsFromPopup, submitAdjustmentPopup: submitAdjustmentPopup };\n  window.loadDeliveryTodayNew = load;'
  );

  const context = vm.createContext({
    window,
    document,
    fetch,
    URLSearchParams,
    AbortController,
    Set,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    Promise,
    console: window.console,
    setTimeout() { return 0; },
    clearTimeout() {}
  });
  vm.runInContext(source, context, { filename: UI_FILE });

  const hooks = window.__phaseA1DeliveryHooks;
  assert.ok(hooks, 'frontend test hooks must be injected');
  hooks.state.adjustmentRow = row;
  hooks.state.correctionReturnItems = returnRows;

  return { hooks, captured };
}

function b0040961Fixture() {
  const row = {
    id: 'SO-B0040961',
    code: 'B0040961',
    orderCode: 'B0040961',
    customerCode: '4501436',
    customerName: 'Chị Bình Lợn',
    originalAmount: 1931784,
    cashAmount: 1932000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    returnedAmount: 1931784,
    finalDebtAmount: -1932000,
    status: 'delivered',
    accountingStatus: 'pending',
    accountingConfirmed: false,
    closeoutEligible: true,
    viewSelectable: true
  };

  // No user edit: oldReturnQty === newReturnQty. The line total intentionally
  // differs from the list-row returnedAmount to reproduce the observed bug:
  // UI derives a false return delta from two different read sources.
  const returnRows = [{
    productKey: 'P-B0040961|Hàng trả hiện hữu|1931784',
    productCode: 'P-B0040961',
    productName: 'Hàng trả hiện hữu',
    deliveredQty: 2,
    oldReturnQty: 2,
    currentReturnQty: 2,
    newReturnQty: 2,
    desiredReturnQty: 2,
    unitPrice: 1931784
  }];

  return { row, returnRows };
}

test('A1 regression: unchanged return quantities do not leak a return mutation into the payment save request', async () => {
  const { row, returnRows } = b0040961Fixture();
  const { hooks, captured } = createUiHarness({ row, returnRows });

  const totals = hooks.totalsFromPopup(row);
  assert.equal(totals.returnItems[0].adjustmentQty, 0, 'user did not change return quantity');
  assert.equal(totals.cashDeltaAmount, -1932000);
  assert.equal(totals.returnDelta, 0, 'return delta is derived only from explicit quantity changes');

  await hooks.submitAdjustmentPopup(row);
  assert.equal(captured.requests.length, 1);
  const payload = captured.requests[0].body;
  assert.equal(payload.changeType, 'PAYMENT_ONLY');
  assert.equal(payload.returnAdjustmentAmount, undefined);
  assert.equal(payload.returnAdjustmentItems, undefined);
  assert.equal(payload.correctedReturnItems, undefined);
});

test('A1 GREEN: B0040961 payment-only save does not contain any return mutation fields', async () => {
  const { row, returnRows } = b0040961Fixture();
  const { hooks, captured } = createUiHarness({ row, returnRows });

  await hooks.submitAdjustmentPopup(row);
  assert.equal(captured.requests.length, 1);
  const payload = captured.requests[0].body;

  assert.equal(payload.paymentCorrection.correctedCashAmount, 0);
  assert.equal(payload.changeType, 'PAYMENT_ONLY');
  assert.equal(payload.paymentCorrection.cashDeltaAmount, undefined, 'client sends final state only; backend computes delta');
  assert.equal(payload.returnAdjustmentAmount, undefined, 'PAYMENT_ONLY must omit returnAdjustmentAmount');
  assert.equal(payload.returnAdjustmentItems, undefined, 'PAYMENT_ONLY must omit returnAdjustmentItems');
  assert.equal(payload.correctedReturnItems, undefined, 'PAYMENT_ONLY must omit correctedReturnItems');
});

test('A1 diagnostic: leaked payload reproduces POST_CLOSEOUT_RETURN_CANNOT_INCREASE_DEBT in the real domain policy', () => {
  const input = {
    receivableDelta: 0,
    cashDelta: -1932000,
    bankDelta: 0,
    rewardDelta: 0,
    returnDelta: 1931784
  };
  const debtDelta = calculateCorrectionDebtDelta(input);
  assert.equal(debtDelta, 216);
  assert.throws(
    () => assertCorrectionDebtDeltaPolicy(input, { debtDelta }),
    (error) => {
      assert.equal(error.code, 'POST_CLOSEOUT_RETURN_CANNOT_INCREASE_DEBT');
      assert.equal(error.status, 409);
      return true;
    }
  );
});
