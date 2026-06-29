'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const core = read('src/services/master-order/deliveryAccountingCore.impl.js');
const command = read('src/services/master-order/deliveryAccountingCommand.impl.js');
const reconcile = read('scripts/reconcile-return-ar.js');

function functionBody(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${startNeedle} is missing`);
  const end = endNeedle ? source.indexOf(endNeedle, start + startNeedle.length) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

test('deliveryAccountingCore routes AR-RETURN only through returnArPostingService', () => {
  const postFn = functionBody(core, 'async function postDeliveryCollectionsAfterAccountingConfirmed', 'function makeBatchArRow');

  assert.match(postFn, /returnArPostingService\.postReturnOrderToAR\(/, 'must call canonical returnArPostingService');
  assert.doesNotMatch(postFn, /postingEngine\.postReturnOrderAR\(/, 'must not call postingEngine.postReturnOrderAR directly');
  assert.doesNotMatch(postFn, /ArLedger\.create\(/, 'must not create arLedgers directly');
  assert.doesNotMatch(postFn, /debtReduction:\s*amount/, 'deliveryAccountingCore must not decide debtReduction amount for AR-RETURN');
  assert.doesNotMatch(postFn, /amount,\s*\n\s*source:/, 'deliveryAccountingCore must not inject selected amount into AR-RETURN');
});

test('deliveryAccountingCore no longer exports ensure/repair/fallback AR-RETURN writers', () => {
  assert.doesNotMatch(core, /ensureArReturnForConfirmedReturnOrder/);
  assert.doesNotMatch(core, /ensureArReturnsForAccountingOrder/);
  assert.doesNotMatch(core, /repairMissingArReturnIfNeeded/);
  assert.doesNotMatch(core, /fallbackReturnAmountFromAccountingOrder/);
  assert.doesNotMatch(core, /PHASE52_SCOPED_FIX/);
  assert.doesNotMatch(command, /repairMissingArReturnIfNeeded/);
  assert.doesNotMatch(command, /ACCOUNTING_REPAIR_AR_RETURN/);
});

test('salesOrder returnAmount without ReturnOrder is reported, not posted from fallback', () => {
  const postFn = functionBody(core, 'async function postDeliveryCollectionsAfterAccountingConfirmed', 'function makeBatchArRow');

  assert.match(postFn, /skip AR-RETURN because returnOrders SSoT is missing/);
  assert.match(postFn, /salesOrder_returnAmount_without_returnOrder/);
  assert.doesNotMatch(postFn, /salesOrder_returnAmount_repair_fallback/);
  assert.match(reconcile, /salesOrderReturnAmountWithoutReturnOrder/);
  assert.match(reconcile, /arReturnNotFromReturnOrder/);
  assert.match(reconcile, /returnOrderAmountFieldMismatch/);
  assert.match(reconcile, /arReturnAmountDifferentFromReturnOrderFields/);
});
