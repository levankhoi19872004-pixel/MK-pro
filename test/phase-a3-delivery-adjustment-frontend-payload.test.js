'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const UI_FILE = path.join(ROOT, 'public/js/app/new/91-delivery-today-new.js');

function input(value) {
  return {
    value: String(value),
    dataset: {},
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    dispatch(type) { if (this.handlers[type]) this.handlers[type]({ target: this }); }
  };
}

function createUiHarness({ row, returnRows, correctedCash, correctedBank = '0', correctedReward = '0' }) {
  const elements = new Map([
    ['deliveryAdjustmentReason', input('')],
    ['deliveryAdjustmentNote', input('Phase A3 payload isolation')],
    ['deliveryAdjustCashNew', input(correctedCash ?? row.cashAmount ?? 0)],
    ['deliveryAdjustBankNew', input(correctedBank)],
    ['deliveryAdjustRewardNew', input(correctedReward)]
  ]);

  const qtyInputs = returnRows.map((item, index) => {
    const el = input(item.newReturnQty);
    el.dataset.index = String(index);
    return el;
  });
  const captured = { requests: [] };

  const document = {
    getElementById(id) { return elements.get(id) || null; },
    querySelector(selector) {
      const match = selector.match(/deliveryNewReturnQtyInput\[data-index="(\d+)"\]/);
      if (match) return qtyInputs[Number(match[1])] || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.deliveryNewReturnQtyInput') return qtyInputs;
      return [];
    },
    addEventListener() {}
  };

  const window = {
    addEventListener() {},
    location: { hash: '', pathname: '/', search: '' },
    console: { debug() {}, warn() {}, error() {}, log() {} }
  };

  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    captured.requests.push({ url, options, body });
    return {
      ok: false,
      async json() { return { message: 'A3_CAPTURE_ONLY' }; }
    };
  };

  let source = fs.readFileSync(UI_FILE, 'utf8');
  source = source.replace(
    '  window.loadDeliveryTodayNew = load;',
    '  window.__phaseA3DeliveryHooks = { state: state, totalsFromPopup: totalsFromPopup, submitAdjustmentPopup: submitAdjustmentPopup, refreshAdjustmentDirtyState: refreshAdjustmentDirtyState, resetAdjustmentDraft: resetAdjustmentDraft, bindAdjustmentInputs: bindAdjustmentInputs, operationIntentForPopup: operationIntentForPopup };\n  window.loadDeliveryTodayNew = load;'
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

  const hooks = window.__phaseA3DeliveryHooks;
  assert.ok(hooks, 'frontend test hooks must be injected');
  hooks.state.adjustmentRow = row;
  hooks.state.correctionReturnItems = returnRows.map((item) => ({ ...item }));
  hooks.resetAdjustmentDraft(row);

  // The harness represents the currently rendered inputs. Reset can restore the
  // draft, but the user-entered DOM values remain the actual submit source.
  elements.get('deliveryAdjustCashNew').value = String(correctedCash ?? row.cashAmount ?? 0);
  elements.get('deliveryAdjustBankNew').value = String(correctedBank);
  elements.get('deliveryAdjustRewardNew').value = String(correctedReward);

  return { hooks, captured, elements, qtyInputs };
}

function openOrder(overrides = {}) {
  return {
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
    viewSelectable: true,
    closeoutVersion: 0,
    version: 7,
    ...overrides
  };
}

function unchangedMismatchedReadRow() {
  return [{
    productKey: 'SP01|Hàng trả hiện hữu|1931784',
    productCode: 'SP01',
    productName: 'Hàng trả hiện hữu',
    deliveredQty: 5,
    oldReturnQty: 2,
    currentReturnQty: 2,
    newReturnQty: 2,
    desiredReturnQty: 2,
    unitPrice: 1931784
  }];
}

test('A3 payment-only B0040961 sends a minimal PAYMENT_ONLY payload and return delta stays zero', async () => {
  const row = openOrder();
  const { hooks, captured } = createUiHarness({
    row,
    returnRows: unchangedMismatchedReadRow(),
    correctedCash: '0'
  });

  const totals = hooks.totalsFromPopup(row);
  assert.equal(totals.cashDeltaAmount, -1932000);
  assert.equal(totals.returnItems[0].adjustmentQty, 0);
  assert.equal(totals.returnDelta, 0, 'return delta must come only from explicit quantity edits');
  assert.equal(totals.returnAfter, 1931784, 'unchanged return total stays on the row baseline');
  assert.equal(totals.finalDebtAfter, 0);

  await hooks.submitAdjustmentPopup(row);
  assert.equal(captured.requests.length, 1);
  const payload = captured.requests[0].body;

  assert.equal(payload.changeType, 'PAYMENT_ONLY');
  assert.deepEqual(payload.paymentCorrection, {
    correctedCashAmount: 0,
    correctedBankAmount: 0,
    correctedRewardAmount: 0
  });
  assert.equal(payload.expectedVersion, '7');
  assert.equal(payload.returnAdjustmentAmount, undefined);
  assert.equal(payload.returnAdjustmentItems, undefined);
  assert.equal(payload.correctedReturnItems, undefined);
  assert.equal(payload.returnAdjustment, undefined);
  assert.equal(payload.correctedCashLines, undefined);
});

test('A3 loading/opening the return tab without editing does not mark return dirty or emit return mutation', async () => {
  const row = openOrder({ cashAmount: 1932000 });
  const { hooks, captured } = createUiHarness({
    row,
    returnRows: unchangedMismatchedReadRow(),
    correctedCash: '1932000'
  });
  hooks.state.activeTab = 'returns';

  const dirty = hooks.refreshAdjustmentDirtyState(row);
  assert.equal(dirty.payment, false);
  assert.equal(dirty.returns, false);

  await hooks.submitAdjustmentPopup(row);
  const payload = captured.requests[0].body;
  assert.equal(payload.changeType, 'PAYMENT_ONLY');
  assert.equal(payload.returnAdjustmentItems, undefined);
  assert.equal(payload.returnAdjustmentAmount, undefined);
});

test('A3 return dirty state is driven by real input changes and clears when the user reverts', () => {
  const row = openOrder({ cashAmount: 1932000 });
  const { hooks, qtyInputs } = createUiHarness({
    row,
    returnRows: unchangedMismatchedReadRow(),
    correctedCash: '1932000'
  });

  hooks.bindAdjustmentInputs(row);
  assert.equal(hooks.state.adjustmentDirty.returns, false);

  qtyInputs[0].value = '3';
  qtyInputs[0].dispatch('input');
  assert.equal(hooks.state.adjustmentDirty.returns, true);

  qtyInputs[0].value = '2';
  qtyInputs[0].dispatch('input');
  assert.equal(hooks.state.adjustmentDirty.returns, false);
});

test('A3 return-only sends only the changed canonical line and leaves payment fields out', async () => {
  const row = openOrder({
    originalAmount: 1000,
    cashAmount: 1000,
    returnedAmount: 200,
    finalDebtAmount: -200,
    version: 4
  });
  const returnRows = [{
    productCode: 'SP01',
    productName: 'Sản phẩm 1',
    deliveredQty: 10,
    oldReturnQty: 2,
    currentReturnQty: 2,
    newReturnQty: 3,
    desiredReturnQty: 3,
    unitPrice: 100
  }];
  const { hooks, captured } = createUiHarness({
    row,
    returnRows,
    correctedCash: '1000'
  });

  await hooks.submitAdjustmentPopup(row);
  const payload = captured.requests[0].body;
  assert.equal(payload.changeType, 'RETURN_ONLY');
  assert.equal(payload.paymentCorrection, undefined);
  assert.equal(payload.returnAdjustmentAmount, undefined, 'client does not send an authoritative aggregate');
  assert.deepEqual(payload.returnAdjustmentItems, [{
    productCode: 'SP01',
    productName: 'Sản phẩm 1',
    newReturnQty: 3,
    desiredReturnQty: 3
  }]);
});

test('A3 combined edit uses COMBINED and keeps payment/return sections isolated', async () => {
  const row = openOrder({
    originalAmount: 1000,
    cashAmount: 1000,
    returnedAmount: 200,
    finalDebtAmount: -200,
    version: 9
  });
  const returnRows = [{
    productCode: 'SP01',
    productName: 'Sản phẩm 1',
    deliveredQty: 10,
    oldReturnQty: 2,
    currentReturnQty: 2,
    newReturnQty: 3,
    desiredReturnQty: 3,
    unitPrice: 100
  }];
  const { hooks, captured } = createUiHarness({ row, returnRows, correctedCash: '900' });

  await hooks.submitAdjustmentPopup(row);
  const payload = captured.requests[0].body;
  assert.equal(payload.changeType, 'COMBINED');
  assert.deepEqual(payload.paymentCorrection, {
    correctedCashAmount: 900,
    correctedBankAmount: 0,
    correctedRewardAmount: 0
  });
  assert.deepEqual(payload.returnAdjustmentItems, [{
    productCode: 'SP01',
    productName: 'Sản phẩm 1',
    newReturnQty: 3,
    desiredReturnQty: 3
  }]);
  assert.equal(payload.returnAdjustmentAmount, undefined);
});
